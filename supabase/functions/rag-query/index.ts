// =============================================================================
// Atlas — RAG Query Edge Function
// =============================================================================
// The core AI interaction endpoint. Handles contextual RAG queries with
// conversation history, query rewriting, vector search, and streaming responses.
//
// POST /api/query
// Body: { conversation_id, document_id?, query }
// Response: Server-Sent Events (SSE) stream
//
// SSE event types:
//   data: {"type":"citation","chunks":[{...}]}   — chunks used for context
//   data: {"type":"token","content":"The"}        — streaming token
//   data: {"type":"done","message_id":"...","usage":{...}}  — completion
//
// Per §5 of the architecture:
//   1. Load conversation history
//   2. Rewrite query if it's a follow-up
//   3. Generate query embedding
//   4. Cosine similarity search in pgvector
//   5. Build messages array (system + history + context + question)
//   6. Stream response via AI provider
//   7. Save messages to database

import { getDb, requireAuth } from "../_shared/db.ts";
import {
  handleCorsPreflight,
  jsonResponse,
  streamResponse,
} from "../_shared/cors.ts";
import {
  ValidationError,
  NotFoundError,
  AIProviderError,
  AtlasError,
} from "../_shared/errors.ts";
import { getAIProvider } from "../_shared/ai-provider.ts";
import { retrieveChunks } from "./retriever.ts";
import { rewriteQuery } from "./query-rewriter.ts";
import type {
  ChatMessage,
  Citation,
  QueryRequest,
  VectorSearchResult,
} from "../_shared/types.ts";

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are Atlas, an AI learning companion. You help users understand and learn from their documents.

Rules:
- Answer ONLY using the provided context. If the context doesn't contain the answer, say "I couldn't find that in your documents."
- Cite specific parts of the context when possible by referencing what the document says.
- Be concise but thorough. Prioritize clarity over verbosity.
- When the user asks a follow-up, use conversation history to understand what they're referring to.
- Format code with proper syntax highlighting using triple backticks.
- Use bullet points for lists and comparisons.
- If the user asks something outside the scope of their documents, gently remind them that you work best when answering questions about their uploaded content.`;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum conversation history messages to include in the LLM context. */
const MAX_HISTORY_MESSAGES = 20;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsPreflight();

  try {
    if (req.method !== "POST") {
      throw new ValidationError("Only POST requests are accepted");
    }

    const userId = await requireAuth(req);
    const payload = await parseQueryRequest(req);

    // Validate conversation ownership if conversation_id is provided
    if (payload.conversation_id) {
      await validateConversation(payload.conversation_id, userId);
    }

    // Execute RAG pipeline
    return await handleRagQuery(payload, userId);
  } catch (error: unknown) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// RAG Pipeline
// ---------------------------------------------------------------------------

async function handleRagQuery(
  payload: QueryRequest,
  userId: string,
): Promise<Response> {
  const { conversation_id, document_id, query } = payload;
  const db = getDb();

  // Step 1: Load conversation history
  const history = conversation_id
    ? await loadConversationHistory(conversation_id, MAX_HISTORY_MESSAGES)
    : [];

  // Step 2: Rewrite query if it's a follow-up (use original for message save)
  const searchQuery = await rewriteQuery(query, history);

  // Step 3: Generate query embedding
  const provider = getAIProvider();
  const queryEmbedding = await provider.embedSingle(searchQuery);

  // Step 4: Vector search
  const searchResults = await retrieveChunks(
    queryEmbedding,
    userId,
    document_id ?? null,
  );

  // Build citation list for the response
  const citations: Citation[] = searchResults.map((r: VectorSearchResult) => ({
    chunk_id: r.chunk_id,
    document_id: r.document_id,
    content_snippet:
      r.content.slice(0, 200) + (r.content.length > 200 ? "..." : ""),
    similarity: Math.round(r.similarity * 1000) / 1000,
  }));

  // Step 5: Build the messages array for the LLM
  const contextText = buildContextText(searchResults);
  const messages = buildMessages(history, query, contextText);

  // Step 6: Stream the response via SSE
  const stream = createSSEStream(
    provider,
    messages,
    citations,
    conversation_id,
    query,
    db,
    userId,
  );

  return streamResponse(stream);
}

// ---------------------------------------------------------------------------
// SSE Streaming
// ---------------------------------------------------------------------------

function createSSEStream(
  provider: ReturnType<typeof getAIProvider>,
  messages: ChatMessage[],
  citations: Citation[],
  conversationId: string | undefined,
  originalQuery: string,
  db: ReturnType<typeof getDb>,
  userId: string,
): ReadableStream<Uint8Array> {
  let fullResponse = "";
  let conversation_id = conversationId;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        // Send citation event first
        const citationEvent = JSON.stringify({
          type: "citation",
          chunks: citations,
        });
        controller.enqueue(encoder.encode(`data: ${citationEvent}\n\n`));

        // Create conversation if it doesn't exist
        if (!conversation_id) {
          const title =
            originalQuery.length > 80
              ? originalQuery.slice(0, 77) + "..."
              : originalQuery;

          const { data: conv, error: convError } = await db
            .from("conversations")
            .insert({
              user_id: userId,
              title,
            })
            .select("id")
            .single();

          if (convError) throw convError;
          conversation_id = conv.id;
        }

        // Stream tokens from the AI provider
        for await (const chunk of provider.chatStream(messages, {
          temperature: 0.3,
          maxTokens: 2048,
        })) {
          if (chunk.content) {
            fullResponse += chunk.content;
            const tokenEvent = JSON.stringify({
              type: "token",
              content: chunk.content,
            });
            controller.enqueue(encoder.encode(`data: ${tokenEvent}\n\n`));
          }
        }

        // Save messages to the database
        const now = new Date().toISOString();

        // Save user message
        await db.from("messages").insert({
          conversation_id,
          role: "user",
          content: originalQuery,
          created_at: now,
        });

        // Calculate approximate token count (chars / 4)
        const tokenCount = Math.ceil(fullResponse.length / 4);

        // Save assistant message with citations
        const { data: assistantMessage, error: msgError } = await db
          .from("messages")
          .insert({
            conversation_id,
            role: "assistant",
            content: fullResponse,
            citations: citations as unknown as Record<string, unknown>[],
            token_count: tokenCount,
            created_at: now,
          })
          .select("id")
          .single();

        if (msgError) throw msgError;

        // Update conversation timestamp
        await db
          .from("conversations")
          .update({ updated_at: now })
          .eq("id", conversation_id);

        // Send done event
        const doneEvent = JSON.stringify({
          type: "done",
          message_id: assistantMessage?.id,
        });
        controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));
        controller.close();
      } catch (error) {
        console.error(
          "[rag-query] Stream error:",
          error instanceof Error ? error.message : error,
        );

        const errorEvent = JSON.stringify({
          type: "error",
          message: "The response was interrupted. Please try again.",
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\n\n`));
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Loads the most recent N messages from a conversation as ChatMessage objects.
 */
async function loadConversationHistory(
  conversationId: string,
  limit: number,
): Promise<ChatMessage[]> {
  const db = getDb();

  const { data, error } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(
      `[rag-query] Could not load history for ${conversationId}:`,
      error.message,
    );
    return [];
  }

  // Reverse to get chronological order
  return (data ?? []).reverse().map((m) => ({
    role: m.role as ChatMessage["role"],
    content: m.content,
  }));
}

/**
 * Builds the LLM messages array: system prompt → history → context + question.
 */
function buildMessages(
  history: ChatMessage[],
  query: string,
  contextText: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Include relevant conversation history
  for (const msg of history) {
    messages.push(msg);
  }

  // The final user message with context and query
  if (contextText) {
    messages.push({
      role: "user",
      content: `Context from your documents:\n\n${contextText}\n\nQuestion: ${query}`,
    });
  } else {
    messages.push({
      role: "user",
      content: query,
    });
  }

  return messages;
}

/**
 * Formats retrieval results into a context string for the LLM prompt.
 */
function buildContextText(results: VectorSearchResult[]): string {
  if (results.length === 0) return "";

  return results
    .map(
      (r, i) =>
        `[Source ${i + 1}] (document: ${r.document_id.slice(0, 8)}..., relevance: ${Math.round(r.similarity * 100)}%)\n${r.content}`,
    )
    .join("\n\n---\n\n");
}

/**
 * Ensures the conversation exists and belongs to the user.
 */
async function validateConversation(
  conversationId: string,
  userId: string,
): Promise<void> {
  const db = getDb();

  const { data, error } = await db
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new NotFoundError("conversation", conversationId);
  }
}

/**
 * Parses and validates the POST body.
 */
async function parseQueryRequest(req: Request): Promise<QueryRequest> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }

  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const { conversation_id, document_id, query } =
    body as Record<string, unknown>;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    throw new ValidationError(
      "query is required and must be a non-empty string",
      "query",
    );
  }

  return {
    conversation_id: (conversation_id as string) ?? undefined,
    document_id: (document_id as string) ?? undefined,
    query: query.trim(),
  };
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function handleError(error: unknown): Response {
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

  if (error instanceof AIProviderError) {
    return jsonResponse(
      {
        error: "ai_unavailable",
        message:
          "The AI service is temporarily unavailable. Try again in a moment.",
      },
      502,
    );
  }

  if (error instanceof AtlasError) {
    return jsonResponse({ error: "internal", message: error.message }, 500);
  }

  console.error(
    "[rag-query] Unhandled error:",
    error instanceof Error ? error.message : error,
  );

  return jsonResponse(
    {
      error: "internal",
      message: "Something went wrong. We've been notified.",
    },
    500,
  );
}