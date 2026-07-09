// =============================================================================
// Atlas — Semantic Chunker
// =============================================================================
// Splits extracted text into semantically coherent chunks for embedding and
// storage. Unlike naive fixed-size sliding windows, this chunker respects
// paragraph and sentence boundaries so each chunk represents a complete thought.
//
// Algorithm (per architecture §4):
//   1. Split on \n\n (paragraph boundaries)
//   2. Merge short paragraphs until reaching ~512 tokens
//   3. Split oversized paragraphs at sentence boundaries (.!?)
//   4. Apply 10% overlap between consecutive chunks
//
// Token estimation: ~4 characters per token (English). We round conservatively
// to avoid exceeding embedding model context windows (which are typically 8k+).

import type { ChunkResult, ChunkMetadata } from "../../_shared/types.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TARGET_TOKENS = 512;
const MIN_TOKENS = 200;
const MAX_TOKENS = 600;
const CHARS_PER_TOKEN = 4;
const OVERLAP_RATIO = 0.1; // 10% overlap between consecutive chunks

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Splits extracted text into chunks suitable for embedding.
 *
 * @param text - The full extracted text from a document
 * @param metadata - Per-page or per-section metadata for attribution
 * @returns Array of ChunkResult, each with content, index, token count, and metadata
 */
export function chunkText(text: string): ChunkResult[] {
  if (!text || text.trim().length === 0) return [];

  // Step 1: Split into paragraphs
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  // Step 2: Merge short paragraphs into ~512-token chunks
  const merged = mergeShortParagraphs(paragraphs);

  // Step 3: Split oversized chunks at sentence boundaries
  const balanced = splitOversizedChunks(merged);

  // Step 4: Apply overlap between consecutive chunks
  const overlapped = applyOverlap(balanced);

  // Step 5: Build result objects
  return overlapped.map((content, index) => ({
    content,
    index,
    tokenCount: estimateTokens(content),
    metadata: {} as ChunkMetadata,
  }));
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimates token count from character count.
 * Rule of thumb: ~4 characters per token for English prose.
 * For code, the ratio is closer to ~3 chars/token, but we use 4 as a safe
 * upper bound to avoid exceeding context windows.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Step 1: Paragraph splitting
// ---------------------------------------------------------------------------

/**
 * Splits text on double-newline boundaries (paragraph breaks).
 * Preserves single newlines within paragraphs (e.g. for lists, code blocks).
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/) // Split on blank lines (may contain whitespace)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// Step 2: Merge short paragraphs
// ---------------------------------------------------------------------------

/**
 * Iterates through paragraphs and merges consecutive short ones until the
 * combined chunk reaches TARGET_TOKENS. Once a chunk reaches the target, it
 * is sealed and a new chunk begins.
 *
 * This prevents embedding tiny fragments like single-line headings or
 * one-sentence paragraphs, which dilute retrieval quality.
 */
function mergeShortParagraphs(paragraphs: string[]): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paraTokens = estimateTokens(paragraph);

    // If adding this paragraph doesn't exceed max, merge it in
    if (currentTokens + paraTokens <= MAX_TOKENS) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      currentTokens = estimateTokens(current);
      continue;
    }

    // Current chunk is full — seal it
    if (current) {
      chunks.push(current);
    }

    // Start new chunk with this paragraph
    current = paragraph;
    currentTokens = paraTokens;
  }

  // Don't forget the last chunk
  if (current) {
    chunks.push(current);
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Step 3: Split oversized chunks at sentence boundaries
// ---------------------------------------------------------------------------

/**
 * If a chunk exceeds MAX_TOKENS, attempt to split it at sentence boundaries
 * (period, exclamation mark, question mark followed by space).
 *
 * If no sentence boundaries exist (e.g. code, tables), falls back to splitting
 * at newline boundaries. If neither exists, the chunk is left intact — it's
 * better to embed a slightly oversized chunk than to create garbage.
 */
function splitOversizedChunks(chunks: string[]): string[] {
  const result: string[] = [];

  for (const chunk of chunks) {
    if (estimateTokens(chunk) <= MAX_TOKENS) {
      result.push(chunk);
      continue;
    }

    // Try sentence-level split
    const sentences = chunk.split(/(?<=[.!?])\s+/);

    if (sentences.length > 1) {
      // Re-merge sentences into target-sized sub-chunks
      let subChunk = "";
      for (const sentence of sentences) {
        const candidate = subChunk ? `${subChunk} ${sentence}` : sentence;
        if (estimateTokens(candidate) > MAX_TOKENS && subChunk) {
          result.push(subChunk.trim());
          subChunk = sentence;
        } else {
          subChunk = candidate;
        }
      }
      if (subChunk) result.push(subChunk.trim());
      continue;
    }

    // Try newline split as fallback
    const lines = chunk.split("\n");
    if (lines.length > 1) {
      let subChunk = "";
      for (const line of lines) {
        const candidate = subChunk ? `${subChunk}\n${line}` : line;
        if (estimateTokens(candidate) > MAX_TOKENS && subChunk) {
          result.push(subChunk.trim());
          subChunk = line;
        } else {
          subChunk = candidate;
        }
      }
      if (subChunk) result.push(subChunk.trim());
      continue;
    }

    // Can't split — keep as-is
    result.push(chunk);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 4: Apply overlap
// ---------------------------------------------------------------------------

/**
 * Prepends the tail of each chunk to the beginning of the next chunk as
 * overlap context. This ensures that semantic boundaries at chunk edges are
 * not lost during retrieval — the overlapping text bridges adjacent chunks.
 *
 * Overlap size: ~10% of TARGET_TOKENS (~50 tokens / ~200 characters).
 */
function applyOverlap(chunks: string[]): string[] {
  if (chunks.length <= 1) return chunks;

  const overlapChars = Math.floor(TARGET_TOKENS * OVERLAP_RATIO * CHARS_PER_TOKEN);
  const result: string[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i - 1];
    const currentChunk = chunks[i];

    // Take the last ~overlapChars characters of the previous chunk
    const overlap = prevChunk.length > overlapChars
      ? prevChunk.slice(-overlapChars)
      : prevChunk;

    // Prepend overlap to the current chunk with a visual separator
    result.push(`...${overlap}\n\n${currentChunk}`);
  }

  return result;
}