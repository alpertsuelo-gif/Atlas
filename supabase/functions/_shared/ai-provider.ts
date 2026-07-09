// =============================================================================
// Atlas — AI Provider Factory
// =============================================================================
// This is the single entry point for all AI calls. Changing the provider
// requires changing ONE environment variable (AI_PROVIDER) and zero code.
//
// Supported values for AI_PROVIDER: gemini | fireworks | openai | anthropic
//
// Each provider is instantiated once and cached for the lifetime of the
// Edge Function invocation (singleton per cold start).
//
// IMPORTANT: Providers are loaded dynamically so only the active provider's
// npm dependencies are resolved at runtime. This keeps deployments small.
// =============================================================================

import type { AIProvider } from "./types.ts";

let _provider: AIProvider | null = null;
let _providerType: string | null = null;

/**
 * Returns a cached singleton of the configured AI provider.
 *
 * Required environment variables depend on the provider:
 *   gemini     → GEMINI_API_KEY
 *   fireworks  → FIREWORKS_API_KEY
 *   openai     → OPENAI_API_KEY
 *   anthropic  → ANTHROPIC_API_KEY
 */
export function getAIProvider(): AIProvider {
  const providerType = Deno.env.get("AI_PROVIDER");

  if (!providerType) {
    throw new Error(
      "AI_PROVIDER environment variable is not set. " +
        "Set it via `supabase secrets set AI_PROVIDER=gemini` (or fireworks|openai|anthropic).",
    );
  }

  // Return cached instance if the provider type hasn't changed
  if (_provider && _providerType === providerType) {
    return _provider;
  }

  _providerType = providerType;
  const apiKey = requireApiKey(providerType);

  // Create a lazy proxy that loads the provider on first method call.
  // This avoids Deno module resolution for unused providers at startup.
  _provider = createLazyProvider(providerType, apiKey);

  return _provider;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function requireApiKey(providerType: string): string {
  const envVarMap: Record<string, string> = {
    gemini: "GEMINI_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
  };

  const envVar = envVarMap[providerType];
  if (!envVar) {
    throw new Error(`No API key env var mapping for provider: ${providerType}`);
  }

  const key = Deno.env.get(envVar);
  if (!key) {
    throw new Error(
      `${envVar} environment variable is required when AI_PROVIDER=${providerType}. ` +
        `Set it via \`supabase secrets set ${envVar}=<your-key>\`.`,
    );
  }

  return key;
}

/**
 * Creates a proxy that lazy-loads the real provider on first method call.
 * The proxy traps all method calls and forwards them to the dynamically
 * imported provider instance.
 */
function createLazyProvider(providerType: string, apiKey: string): AIProvider {
  let realProvider: AIProvider | null = null;

  async function ensureLoaded(): Promise<AIProvider> {
    if (realProvider) return realProvider;

    switch (providerType) {
      case "fireworks": {
        const { FireworksProvider } = await import("./providers/fireworks.ts");
        realProvider = new FireworksProvider(apiKey);
        break;
      }
      case "gemini": {
        const { GeminiProvider } = await import("./providers/gemini.ts");
        realProvider = new GeminiProvider(apiKey);
        break;
      }
      case "openai": {
        const { OpenAIProvider } = await import("./providers/openai.ts");
        realProvider = new OpenAIProvider(apiKey);
        break;
      }
      case "anthropic": {
        const { AnthropicProvider } = await import("./providers/anthropic.ts");
        realProvider = new AnthropicProvider(apiKey);
        break;
      }
      default:
        throw new Error(`Unknown AI_PROVIDER: "${providerType}"`);
    }

    return realProvider;
  }

  // Create a proxy that ensures the provider is loaded, then forwards
  // the method call. This works even for sync method calls because the
  // proxy returns promises — the caller's `await` handles it.
  const proxy: AIProvider = {
    async embed(texts: string[]): Promise<number[][]> {
      return (await ensureLoaded()).embed(texts);
    },
    async embedSingle(text: string): Promise<number[]> {
      return (await ensureLoaded()).embedSingle(text);
    },
    async chat(
      messages: Parameters<AIProvider["chat"]>[0],
      options?: Parameters<AIProvider["chat"]>[1],
    ): ReturnType<AIProvider["chat"]> {
      return (await ensureLoaded()).chat(messages, options);
    },
    chatStream(
      messages: Parameters<AIProvider["chatStream"]>[0],
      options?: Parameters<AIProvider["chatStream"]>[1],
    ): ReturnType<AIProvider["chatStream"]> {
      // chatStream is sync (returns AsyncIterable), so we need to create
      // a delegating async iterable
      const self = this;
      return {
        [Symbol.asyncIterator]() {
          let delegate: AsyncIterable<import("./types.ts").ChatChunk> | null = null;

          return {
            async next() {
              if (!delegate) {
                const p = await ensureLoaded();
                delegate = p.chatStream(messages, options);
              }
              return delegate[Symbol.asyncIterator]().next();
            },
          };
        },
      };
    },
  };

  return proxy;
}
