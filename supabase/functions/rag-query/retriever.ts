// =============================================================================
// Atlas — RAG Retriever
// =============================================================================
// Executes vector similarity search against document_chunks using pgvector.
// This is separated from the main handler so the retrieval logic can be
// tested, tuned, and potentially replaced (e.g. hybrid search with keyword
// boosting) without touching the orchestration layer.
//
// Key design decisions:
//   - Uses service role client (bypasses RLS) for query performance. user_id
//     is enforced explicitly in the WHERE clause.
//   - IVFFlat index is used for approximate search. The index must have been
//     built (it is created in migration 00001) and data must be loaded.
//   - Cosine similarity is computed as 1 - (embedding <=> query_embedding)
//     where <=> is pgvector's cosine distance operator.

import { getDb } from "../_shared/db.ts";
import type { VectorSearchResult } from "../_shared/types.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Number of candidate chunks to retrieve before reranking. */
const TOP_K = 10;

/** Minimum similarity threshold. Chunks below this are discarded. */
const MIN_SIMILARITY = 0.5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Searches document_chunks for the most semantically similar chunks to the
 * given query embedding.
 *
 * @param queryEmbedding - The 768-dimensional query vector
 * @param userId - Restricts search to this user's chunks
 * @param documentId - If provided, restricts search to a single document; null = all docs
 * @returns Ranked, deduplicated, threshold-filtered results (max TOP_K)
 */
export async function retrieveChunks(
  queryEmbedding: number[],
  userId: string,
  documentId: string | null,
): Promise<VectorSearchResult[]> {
  const db = getDb();

  // Build the query
  // pgvector cosine distance: embedding <=> $query returns distance (0=identical, 2=opposite)
  // Similarity = 1 - distance  (range: -1 to 1)
  let query = db
    .from("document_chunks")
    .select(
      "id, document_id, content, metadata, 1 - (embedding <=> $embedding) as similarity",
    )
    .eq("user_id", userId)
    .order("similarity", { ascending: false })
    .limit(TOP_K);

  if (documentId) {
    query = query.eq("document_id", documentId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Vector search failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Cast the raw rows to our result type, filter by similarity threshold,
  // and deduplicate
  const results = (data as unknown as RawSearchRow[])
    .filter((row) => row.similarity >= MIN_SIMILARITY)
    .map((row) => ({
      chunk_id: row.id,
      document_id: row.document_id,
      content: row.content,
      similarity: row.similarity,
      metadata: row.metadata ?? {},
    }));

  return deduplicateChunks(results);
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

interface RawSearchRow {
  id: string;
  document_id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

/**
 * Removes near-duplicate chunks that share substantial content overlap.
 * When two chunks have >80% token overlap (Jaccard similarity on word sets),
 * keep the one with the higher similarity score.
 */
function deduplicateChunks(
  chunks: VectorSearchResult[],
): VectorSearchResult[] {
  if (chunks.length <= 1) return chunks;

  const keep: VectorSearchResult[] = [];
  const keptWordSets: Set<string>[] = [];

  for (const chunk of chunks) {
    const words = new Set(
      chunk.content.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
    );

    const isDuplicate = keptWordSets.some((existing) => {
      const intersection = new Set([...words].filter((w) => existing.has(w)));
      const union = new Set([...words, ...existing]);
      const jaccard = intersection.size / union.size;
      return jaccard > 0.8;
    });

    if (!isDuplicate) {
      keep.push(chunk);
      keptWordSets.push(words);
    }
  }

  return keep;
}