// =============================================================================
// Atlas — Fireworks AI Provider
// =============================================================================
// Implements the AIProvider interface using Fireworks AI's OpenAI-compatible
// API. Uses the standard OpenAI SDK with a custom base URL.
//
// Models used:
//   Embedding: nomic-ai/nomic-embed-text-v1.5 (768 dimensions)
//   Chat:      accounts/fireworks/models/llama-v3p1-405b-instruct (default)
//              accounts/fireworks/models/llama-v3p3-70b-instruct (fast/cheap)
//
// Fireworks API base URL: https://api.fireworks.ai/inference/v1

import type {
  AIProvider,
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types.ts";
import { AIProviderError } from "../errors.ts";
import OpenAI from "npm:openai@4";

const FIREWORKS_BASE_URL = "https://api.fireworks.ai/inference/v1";
const EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
const DEFAULT_CHAT_MODEL = "accounts/fireworks/models/llama-v3p1-405b-instruct";

export class FireworksProvider implements AIProvider {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: FIREWORKS_BASE_URL,
    });
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
      });

      // Sort by index to preserve input order
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
        throw new Error("Fireworks returned empty response");
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
      error instanceof Error ? error.message : "Unknown Fireworks API error";

    let statusCode: number | undefined;
    if (
      error &&
      typeof error === "object" &&
      "status" in error
    ) {
      statusCode = (error as { status: number }).status;
    }

    console.error(`[FireworksProvider.${operation}] ${message}`, error);

    return new AIProviderError(
      `Fireworks API error during ${operation}: ${message}`,
      "fireworks",
      statusCode,
    );
  }
}