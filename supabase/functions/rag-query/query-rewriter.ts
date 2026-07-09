// =============================================================================
// Atlas — Query Rewriter
// =============================================================================
// Transforms user follow-up questions into standalone search queries using
// conversation history. This is the "secret sauce" (§5.3) that makes
// contextual RAG work.
//
// Problem:
//   User: "Explain transformer attention mechanisms"
//   Atlas: [detailed answer about attention]
//   User: "What about the limitations?"
//
// Without rewriting, embedding "What about the limitations?" matches nothing
// relevant — it has no semantic connection to "transformer attention".
//
// Solution:
//   We pass the conversation history to a cheap/fast LLM and ask it to rewrite
//   the user's follow-up into a standalone query:
//   → "What are the limitations of transformer attention mechanisms?"
//
// Performance: ~50 tokens, < 200ms. This is a lightweight pre-call that
// dramatically improves retrieval quality for multi-turn conversations.

import { getAIProvider } from "../_shared/ai-provider.ts";
import type { ChatMessage } from "../_shared/types.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of recent messages to include as context for rewriting. */
const MAX_HISTORY_MESSAGES = 10;

const REWRITE_SYSTEM_PROMPT = `You are a query rewriter for a RAG (Retrieval Augmented Generation) system.
Your ONLY job is to convert a user's follow-up question into a standalone search query.

Rules:
- If the question is ALREADY standalone, return it unchanged.
- If it refers to something from the conversation history (pronouns, references,
  ellipsis like "what about X?"), rewrite it to include the missing context.
- Return ONLY the rewritten query. No explanation, no preamble, no quotation marks.
- The query should be a single line of plain text.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determines whether the user's query needs rewriting (i.e., it's a follow-up),
 * and if so, uses the LLM to produce a standalone search query.
 *
 * @param userQuery - The raw user message to potentially rewrite
 * @param conversationHistory - Previous messages in the conversation (excluding the current query)
 * @returns The rewritten standalone query, or the original if no rewriting is needed
 */
export async function rewriteQuery(
  userQuery: string,
  conversationHistory: ChatMessage[],
): Promise<string> {
  // If there's no history, the query is already standalone
  if (conversationHistory.length === 0) {
    return userQuery;
  }

  // If the query is long and specific, it's likely already standalone
  if (userQuery.length > 100 && userQuery.includes(" ")) {
    return userQuery;
  }

  // Quick heuristic: if the query contains common follow-up patterns, it needs rewriting
  if (!looksLikeFollowUp(userQuery)) {
    return userQuery;
  }

  // Use a cheap model for query rewriting
  const provider = getAIProvider();
  const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);

  const messages: ChatMessage[] = [
    { role: "system", content: REWRITE_SYSTEM_PROMPT },
    ...recentHistory,
    {
      role: "user",
      content: `Rewrite this follow-up question into a standalone search query:\n"${userQuery}"`,
    },
  ];

  try {
    const response = await provider.chat(messages, {
      temperature: 0,
      maxTokens: 100,
      // Use the default model for this lightweight task
    });

    const rewritten = response.content.trim();

    // If the LLM returned something sensible, use it. Otherwise fall back.
    if (rewritten && rewritten.length > 5 && rewritten !== userQuery) {
      return rewritten;
    }

    return userQuery;
  } catch (error) {
    // If rewriting fails, fall back to the original query.
    // Better to search with a suboptimal query than to fail entirely.
    console.warn(
      "[query-rewriter] Rewrite failed, using original query:",
      error instanceof Error ? error.message : error,
    );
    return userQuery;
  }
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

/**
 * Quick heuristic check for follow-up patterns that need rewriting.
 * These are cheap string checks; the LLM handles the real rewriting.
 */
function looksLikeFollowUp(query: string): boolean {
  const lower = query.toLowerCase().trim();

  // Very short queries are almost always follow-ups
  if (lower.split(/\s+/).length <= 4) return true;

  // Common follow-up patterns
  const followUpPatterns = [
    /^what about/i,
    /^but what about/i,
    /^how about/i,
    /^and what about/i,
    /^can you (explain|elaborate|clarify|expand)/i,
    /^tell me more/i,
    /^what (does|do) (that|this|it|they) mean/i,
    /^why (is|does|would) (that|this|it)/i,
    /^how (does|would|is) (that|this|it)/i,
    /^(that|this|it) (is|was|seems) /i,
    /^what (else|other)/i,
    /^is (there|that) (more|anything)/i,
    /^go on/i,
    /^continue/i,
  ];

  return followUpPatterns.some((pattern) => pattern.test(lower));
}