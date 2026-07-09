// =============================================================================
// Atlas — process-document Edge Function
// =============================================================================
// Orchestrates the full document processing pipeline:
//   Download → Extract → Chunk → Embed → Store → Finalize
//
// Trigger: HTTP POST (called by frontend after file upload to Storage)
//
// Body: {
//   document_id: string,    // UUID of the document row (pre-created by frontend)
//   user_id: string,        // Authenticated user ID
//   storage_path: string,   // Path in Supabase Storage bucket
//   file_type: "pdf"|"markdown"|"txt"|"code"
// }
//
// The frontend flow:
//   1. Upload file to Supabase Storage → get path
//   2. INSERT into documents (status='processing') → get document_id
//   3. POST /process-document with the details above
//   4. Poll GET /documents/:id until status='ready' or 'error'

import { getDb, requireAuth } from "../_shared/db.ts";
import {
  handleCorsPreflight,
  jsonResponse,
  withCors,
} from "../_shared/cors.ts";
import {
  ValidationError,
  NotFoundError,
  ProcessingError,
  AtlasError,
} from "../_shared/errors.ts";
import { extractTextFromFile } from "./extractors/index.ts";
import { chunkText } from "./chunker.ts";
import { getAIProvider } from "../_shared/ai-provider.ts";
import type {
  FileType,
  ChunkResult,
  ProcessDocumentPayload,
} from "../_shared/types.ts";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  // CORS preflight
  if (req.method === "OPTIONS") return handleCorsPreflight();

  try {
    // Only POST is accepted
    if (req.method !== "POST") {
      throw new ValidationError("Only POST requests are accepted");
    }

    // Authenticate
    const userId = await requireAuth(req);

    // Parse and validate payload
    const payload = await parsePayload(req, userId);

    // Run the pipeline
    await processDocument(payload);

    return jsonResponse({
      success: true,
      document_id: payload.document_id,
      status: "ready",
    });
  } catch (error: unknown) {
    return handleError(error, req);
  }
}

// ---------------------------------------------------------------------------
// Pipeline Steps
// ---------------------------------------------------------------------------

async function processDocument(payload: ProcessDocumentPayload): Promise<void> {
  const { document_id, user_id, storage_path, file_type } = payload;
  const db = getDb();

  // Step 1: Verify the document exists and belongs to this user
  const { data: doc, error: docError } = await db
    .from("documents")
    .select("id, status")
    .eq("id", document_id)
    .eq("user_id", user_id)
    .single();

  if (docError || !doc) {
    throw new NotFoundError("document", document_id);
  }

  if (doc.status !== "processing") {
    throw new ValidationError(
      `Document status is "${doc.status}" — expected "processing". ` +
        "The document may have already been processed.",
    );
  }

  try {
    // Step 2: Download the file from Supabase Storage
    const fileBuffer = await downloadFile(storage_path);

    // Step 3: Extract text based on file type
    const extraction = await extractTextFromFile(
      fileBuffer,
      file_type as FileType,
      storage_path.split("/").pop() ?? "unknown",
    );

    // Step 4: Semantic chunking
    const chunks = chunkText(extraction.text);

    if (chunks.length === 0) {
      throw new ProcessingError(
        "No content could be extracted from this file. The file may be empty or in an unsupported format.",
        document_id,
      );
    }

    // Update metadata with extraction info
    await db
      .from("documents")
      .update({
        metadata: {
          ...extraction.metadata,
          page_count: extraction.pageCount,
        },
      })
      .eq("id", document_id);

    // Step 5: Batch-embed all chunks
    const provider = getAIProvider();
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await provider.embed(chunkTexts);

    if (embeddings.length !== chunks.length) {
      throw new ProcessingError(
        `Embedding mismatch: got ${embeddings.length} embeddings for ${chunks.length} chunks.`,
        document_id,
      );
    }

    // Step 6: Insert chunks with embeddings into document_chunks
    const chunkRows = chunks.map((chunk: ChunkResult, i: number) => ({
      document_id,
      user_id,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      embedding: embeddings[i],
      metadata: chunk.metadata,
    }));

    // Insert in batches of 50 to avoid excessively large SQL statements
    const BATCH_SIZE = 50;
    for (let i = 0; i < chunkRows.length; i += BATCH_SIZE) {
      const batch = chunkRows.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await db
        .from("document_chunks")
        .insert(batch);

      if (insertError) {
        throw new ProcessingError(
          `Failed to insert chunks: ${insertError.message}`,
          document_id,
        );
      }
    }

    // Step 7: Mark document as ready
    const { error: updateError } = await db
      .from("documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
      })
      .eq("id", document_id);

    if (updateError) {
      throw new ProcessingError(
        `Failed to update document status: ${updateError.message}`,
        document_id,
      );
    }

    // Step 8: Progress event is auto-logged by the trg_document_progress trigger
    // (see migrations/00003_triggers.sql). No manual INSERT needed.
  } catch (error: unknown) {
    // Mark the document as errored so the frontend can surface it
    const errorMessage =
      error instanceof Error ? error.message : "Unknown processing error";

    await db
      .from("documents")
      .update({
        status: "error",
        error_message: errorMessage,
      })
      .eq("id", document_id);

    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Downloads a file from Supabase Storage into a Uint8Array.
 */
async function downloadFile(storagePath: string): Promise<Uint8Array> {
  const db = getDb();

  // Extract bucket name from the path. Storage paths are: bucket/path
  // or just path if using default. We assume "user-documents" bucket.
  const bucketName = "user-documents";

  const { data, error } = await db.storage
    .from(bucketName)
    .download(storagePath);

  if (error || !data) {
    throw new ProcessingError(
      `Could not download file from storage: ${error?.message ?? "File not found"}`,
      "",
    );
  }

  return new Uint8Array(await data.arrayBuffer());
}

/**
 * Parses and validates the request body against the ProcessDocumentPayload shape.
 */
async function parsePayload(
  req: Request,
  userId: string,
): Promise<ProcessDocumentPayload> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }

  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const { document_id, user_id, storage_path, file_type } =
    body as Record<string, unknown>;

  if (!document_id || typeof document_id !== "string") {
    throw new ValidationError(
      "document_id is required and must be a string",
      "document_id",
    );
  }

  if (!storage_path || typeof storage_path !== "string") {
    throw new ValidationError(
      "storage_path is required and must be a string",
      "storage_path",
    );
  }

  if (!file_type || typeof file_type !== "string") {
    throw new ValidationError(
      "file_type is required and must be one of: pdf, markdown, txt, code",
      "file_type",
    );
  }

  const validTypes = ["pdf", "markdown", "txt", "code"];
  if (!validTypes.includes(file_type)) {
    throw new ValidationError(
      `file_type must be one of: ${validTypes.join(", ")}`,
      "file_type",
    );
  }

  // The authenticated user must match the user_id in the payload
  if (user_id && user_id !== userId) {
    throw new ValidationError(
      "user_id does not match the authenticated user",
      "user_id",
    );
  }

  return {
    document_id,
    user_id: userId,
    storage_path,
    file_type: file_type as FileType,
  };
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function handleError(error: unknown, _req: Request): Response {
  // Known errors → appropriate HTTP status
  if (error instanceof ValidationError) {
    return jsonResponse(
      { error: "validation", message: error.message, field: error.field },
      400,
    );
  }

  if (error instanceof NotFoundError) {
    return jsonResponse(
      { error: "not_found", message: "Resource not found" },
      404,
    );
  }

  if (error instanceof ProcessingError) {
    return jsonResponse(
      {
        error: "processing_failed",
        message: error.message,
        document_id: error.documentId,
      },
      422,
    );
  }

  if (error instanceof AtlasError) {
    return jsonResponse(
      { error: "internal", message: error.message },
      500,
    );
  }

  // Unexpected errors — log, return generic message
  console.error(
    "[process-document] Unhandled error:",
    error instanceof Error ? error.message : error,
  );

  return jsonResponse(
    {
      error: "internal",
      message: "Something went wrong while processing your document. We've been notified.",
    },
    500,
  );
}