// =============================================================================
// Atlas — Anthropic Provider
// =============================================================================
// Implements the AIProvider interface using the Anthropic API.
//
// Models used:
//   Embedding: NOT SUPPORTED — Anthropic has no native embedding API.
//              The architecture specifies Voyage AI separately for embeddings.
//              Calling embed() on this provider throws an error with
//              instructions on how to configure embeddings.
//   Chat:      claude-sonnet-4-20250514 (default)
//
// Message format: Anthropic uses a different message structure from OpenAI/Gemini.
// - System prompt is a top-level parameter, not a message
// - Messages have role: "user" | "assistant" (no "system" role)
// - Streaming returns typed events: content_block_start, content_block_delta, etc.

import type {
  AIProvider,
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types.ts";
import { AIProviderError } from "../errors.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.39";

const DEFAULT_CHAT_MODEL = "claude-sonnet-4-20250514";

export class AnthropicProvider implements AIProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  // ---------------------------------------------------------------------------
  // Embeddings — NOT SUPPORTED
  // ---------------------------------------------------------------------------

  async embed(_texts: string[]): Promise<number[][]> {
    throw new AIProviderError(
      "Anthropic does not provide an embedding API. " +
        "To use embeddings with Anthropic for chat, set AI_PROVIDER=anthropic " +
        "and configure a separate embedding service, or switch to a provider " +
        "that supports embeddings natively (gemini, fireworks, openai).",
      "anthropic",
    );
  }

  async embedSingle(_text: string): Promise<number[]> {
    throw new AIProviderError(
      "Anthropic does not provide an embedding API. See embed() error for details.",
      "anthropic",
    );
  }

  // ---------------------------------------------------------------------------
  // Chat (non-streaming)
  // ---------------------------------------------------------------------------

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? DEFAULT_CHAT_MODEL;
    const systemPrompt = extractSystemPrompt(messages);
    const anthropicMessages = convertToAnthropicMessages(messages);

    try {
      const response = await this.client.messages.create({
        model,
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens ?? 2048,
        temperature: options?.temperature ?? 0.3,
      });

      // Anthropic returns content blocks; extract the first text block
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );

      return {
        content: textBlock?.text ?? "",
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
        },
        model,
      };
    } catch (error: unknown) {
      throw this.wrapError(error, "chat");
    }
  }

  // ---------------------------------------------------------------------------
  // Chat (streaming)
  // ---------------------------------------------------------------------------

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncIterable<ChatChunk> {
    const model = options?.model ?? DEFAULT_CHAT_MODEL;
    const systemPrompt = extractSystemPrompt(messages);
    const anthropicMessages = convertToAnthropicMessages(messages);

    try {
      const stream = await this.client.messages.stream({
        model,
        system: systemPrompt,
        messages: anthropicMessages,
        max_tokens: options?.maxTokens ?? 2048,
        temperature: options?.temperature ?? 0.3,
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { content: event.delta.text, done: false };
        }
      }
    } catch (error: unknown) {
      throw this.wrapError(error, "chatStream");
    }

    yield { content: "", done: true };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private wrapError(error: unknown, operation: string): AIProviderError {
    const message =
      error instanceof Error ? error.message : "Unknown Anthropic API error";

    let statusCode: number | undefined;
    if (
      error &&
      typeof error === "object" &&
      "status" in error
    ) {
      statusCode = (error as { status: number }).status;
    }

    console.error(`[AnthropicProvider.${operation}] ${message}`, error);

    return new AIProviderError(
      `Anthropic API error during ${operation}: ${message}`,
      "anthropic",
      statusCode,
    );
  }
}

// ---------------------------------------------------------------------------
// Anthropic-specific message conversion
// ---------------------------------------------------------------------------

/**
 * Anthropic handles system prompts as a top-level parameter, not as a message.
 * We extract the first system-role message and return its content.
 */
function extractSystemPrompt(messages: ChatMessage[]): string | null {
  for (const msg of messages) {
    if (msg.role === "system") return msg.content;
  }
  return null;
}

/**
 * Anthropic only supports "user" and "assistant" roles. System messages are
 * filtered out (handled separately via the system parameter).
 */
function convertToAnthropicMessages(
  messages: ChatMessage[],
): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    }));
}