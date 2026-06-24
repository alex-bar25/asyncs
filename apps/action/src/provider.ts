import { createAnthropicProviderClient, createOpenAIProviderClient, isBuiltInProviderKind } from "@asyncs/providers";
import { DEFAULT_ANTHROPIC_REVIEW_MODEL, DEFAULT_OPENAI_REVIEW_MODEL } from "./constants";
import type { ResolveProviderOptions, ResolvedProvider } from "./types";

export class MissingApiKeyError extends Error {
  constructor(provider: string, envKey: string) {
    super(`${provider} API key is required. Set ${envKey} or pass the matching api key option to resolveProvider.`);
    this.name = "MissingApiKeyError";
  }
}

export class UnknownProviderError extends Error {
  constructor(provider: string) {
    super(`Unknown provider: ${provider}. Supported providers: openai, anthropic.`);
    this.name = "UnknownProviderError";
  }
}

export function resolveProvider(options: ResolveProviderOptions = {}): ResolvedProvider {
  const provider = resolveProviderKind(options.provider ?? process.env.ASYNCS_PROVIDER ?? "openai");

  if (provider === "anthropic") {
    return resolveAnthropicProvider(options);
  }

  return resolveOpenAIProvider(options);
}

function resolveOpenAIProvider(options: ResolveProviderOptions): ResolvedProvider {
  const apiKey = nonEmpty(options.openAIApiKey) ?? nonEmpty(process.env.OPENAI_API_KEY);

  if (apiKey === undefined) {
    throw new MissingApiKeyError("OpenAI", "OPENAI_API_KEY");
  }

  const model = options.model ?? process.env.ASYNCS_MODEL ?? DEFAULT_OPENAI_REVIEW_MODEL;

  const provider = createOpenAIProviderClient({
    apiKey,
    ...(options.maxTokens === undefined ? {} : { maxOutputTokens: options.maxTokens }),
  });

  return { provider, model };
}

function resolveAnthropicProvider(options: ResolveProviderOptions): ResolvedProvider {
  const apiKey = nonEmpty(options.anthropicApiKey) ?? nonEmpty(process.env.ANTHROPIC_API_KEY);

  if (apiKey === undefined) {
    throw new MissingApiKeyError("Anthropic", "ANTHROPIC_API_KEY");
  }

  const model = options.model ?? process.env.ASYNCS_MODEL ?? DEFAULT_ANTHROPIC_REVIEW_MODEL;

  const provider = createAnthropicProviderClient({
    apiKey,
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
  });

  return { provider, model };
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined;
}

function resolveProviderKind(provider: string): "openai" | "anthropic" {
  if (isBuiltInProviderKind(provider)) {
    return provider;
  }

  throw new UnknownProviderError(provider);
}
