// =============================================================================
// Atlas — OpenAI Provider
// =============================================================================
// Implements the AIProvider interface using the OpenAI API.
//
// Models used:
//   Embedding: text-embedding-3-small (768 dimensions via Matryoshka)
//   Chat:      gpt-4o (default) / gpt-4o-mini (fast/cheap override)
//
// Important: The text-embedding-3-small model natively returns 1536 dimensions,
// but we request 768 via the `dimensions` parameter to match our vector(768)
// column. This uses OpenAI's Matryoshka representation learning — quality loss
// is minimal compared to naive truncation.

import type {
  AIProvider,
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types.ts";
import { AIProviderError } from "../errors.ts";
import OpenAI from "npm:openai@4";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 768;
const DEFAULT_CHAT_MODEL = "gpt-4o";

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS, // Matryoshka: 1536 → 768
      });

      const sorted = response.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error: unknown) {
      throw this.wrapError(error, "embed");
    }
  }

  async embedSingle(text: string): Promise<number[]> {
    const results = await this.embed([text]);
    return results[0];
  }

  // ---------------------------------------------------------------------------
  // Chat (non-streaming)
  // ---------------------------------------------------------------------------

  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const model = options?.model ?? DEFAULT_CHAT_MODEL;

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
        ...(options?.responseFormat === "json"
          ? { response_format: { type: "json_object" } }
          : {}),
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error("OpenAI returned empty response");
      }

      return {
        content: choice.message.content,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
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

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 2048,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield { content, done: false };
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
      error instanceof Error ? error.message : "Unknown OpenAI API error";

    let statusCode: number | undefined;
    if (
      error &&
      typeof error === "object" &&
      "status" in error
    ) {
      statusCode = (error as { status: number }).status;
    }

    console.error(`[OpenAIProvider.${operation}] ${message}`, error);

    return new AIProviderError(
      `OpenAI API error during ${operation}: ${message}`,
      "openai",
      statusCode,
    );
  }
}