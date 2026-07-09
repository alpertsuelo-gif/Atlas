// =============================================================================
// Atlas — Gemini AI Provider
// =============================================================================
// Implements the AIProvider interface using Google Gemini via the
// @google/generative-ai SDK.
//
// Models used:
//   Embedding: text-embedding-004 (768 dimensions)
//   Chat:      gemini-2.0-flash (default, fast/cheap)
//              gemini-2.5-pro (override via ChatOptions.model for heavy tasks)
//
// Key behaviours:
//   - Batch embedding: sends all texts in a single API call via batchEmbedContents
//   - Streaming: adapts Gemini's AsyncGenerator to our ChatChunk AsyncIterable
//   - Error wrapping: all Google API errors become AIProviderError

import type {
  AIProvider,
  ChatChunk,
  ChatMessage,
  ChatOptions,
  ChatResponse,
} from "../types.ts";
import { AIProviderError } from "../errors.ts";

// SDK types — imported at module level for type safety, SDK loaded lazily
import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from "npm:@google/generative-ai@0.21";

const EMBEDDING_MODEL = "text-embedding-004";
const DEFAULT_CHAT_MODEL = "gemini-2.0-flash";

export class GeminiProvider implements AIProvider {
  private readonly genAI: GoogleGenerativeAI;
  private _embeddingModel: GenerativeModel | null = null;
  private _chatModel: GenerativeModel | null = null;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  // ---------------------------------------------------------------------------
  // Embeddings
  // ---------------------------------------------------------------------------

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const model = this.getEmbeddingModel();

      if (texts.length === 1) {
        const result = await model.embedContent(texts[0]);
        return [Array.from(result.embedding.values as number[] | Iterable<number>)];
      }

      // Batch embedding — single API call for all texts
      const batchResult = await model.batchEmbedContents({
        requests: texts.map((text) => ({
          content: { role: "user", parts: [{ text }] },
        })),
      });

      return batchResult.embeddings.map((emb) =>
        Array.from(emb.values as number[] | Iterable<number>)
      );
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
    const model = this.getChatModel(options?.model);
    const systemInstruction = extractSystemInstruction(messages);
    const history = buildGeminiHistory(messages);
    const lastMessage = messages[messages.length - 1];

    try {
      const result = await model.generateContent({
        systemInstruction: systemInstruction
          ? { role: "user", parts: [{ text: systemInstruction }] }
          : undefined,
        contents: [
          ...history,
          { role: "user", parts: [{ text: lastMessage.content }] },
        ],
        generationConfig: {
          temperature: options?.temperature ?? 0.3,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      const content = result.response.text();
      const usage = result.response.usageMetadata ?? {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      };

      return {
        content,
        usage: {
          promptTokens: usage.promptTokenCount ?? 0,
          completionTokens: usage.candidatesTokenCount ?? 0,
        },
        model: options?.model ?? DEFAULT_CHAT_MODEL,
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
    const model = this.getChatModel(options?.model);
    const systemInstruction = extractSystemInstruction(messages);
    const history = buildGeminiHistory(messages);
    const lastMessage = messages[messages.length - 1];

    try {
      const stream = await model.generateContentStream({
        systemInstruction: systemInstruction
          ? { role: "user", parts: [{ text: systemInstruction }] }
          : undefined,
        contents: [
          ...history,
          { role: "user", parts: [{ text: lastMessage.content }] },
        ],
        generationConfig: {
          temperature: options?.temperature ?? 0.3,
          maxOutputTokens: options?.maxTokens ?? 2048,
        },
      });

      for await (const chunk of stream.stream) {
        const text = chunk.text();
        if (text) {
          yield { content: text, done: false };
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

  private getEmbeddingModel(): GenerativeModel {
    if (!this._embeddingModel) {
      this._embeddingModel = this.genAI.getGenerativeModel({
        model: EMBEDDING_MODEL,
      });
    }
    return this._embeddingModel;
  }

  private getChatModel(modelOverride?: string): GenerativeModel {
    const modelName = modelOverride ?? DEFAULT_CHAT_MODEL;

    // Cache only the default model; overrides are created fresh each time
    if (!modelOverride) {
      if (!this._chatModel) {
        this._chatModel = this.genAI.getGenerativeModel({
          model: modelName,
        });
      }
      return this._chatModel;
    }

    return this.genAI.getGenerativeModel({ model: modelName });
  }

  private wrapError(error: unknown, operation: string): AIProviderError {
    const message =
      error instanceof Error ? error.message : "Unknown Gemini API error";

    let statusCode: number | undefined;
    // Google API errors often include a status field
    if (error && typeof error === "object" && "status" in error) {
      statusCode = (error as { status: number }).status;
    }

    console.error(`[GeminiProvider.${operation}] ${message}`, error);

    return new AIProviderError(
      `Gemini API error during ${operation}: ${message}`,
      "gemini",
      statusCode,
    );
  }
}

// ---------------------------------------------------------------------------
// Gemini-specific message conversion helpers
// ---------------------------------------------------------------------------

/**
 * Gemini requires the system instruction to be passed separately from the
 * message history (not as a message with role="system"). We extract the
 * first system message from the ChatMessage array and return it.
 */
function extractSystemInstruction(messages: ChatMessage[]): string | null {
  // Gemini uses the first user message's systemInstruction field, or we can
  // look for a system-role message and lift it out.
  for (const msg of messages) {
    if (msg.role === "system") return msg.content;
  }
  return null;
}

/**
 * Gemini requires messages in { role: "user" | "model", parts: [...] } format.
 * It does NOT support role="system" or role="assistant" — we remap those.
 * We exclude the last message (it's sent as the current content) and filter
 * out system messages (handled via systemInstruction).
 */
function buildGeminiHistory(
  messages: ChatMessage[],
): { role: "user" | "model"; parts: { text: string }[] }[] {
  const history = messages.slice(0, -1);

  return history
    .filter((msg) => msg.role !== "system")
    .map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));
}