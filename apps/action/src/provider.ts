import { createAnthropicProviderClient } from "@asyncs/providers";
import { DEFAULT_REVIEW_MODEL, MISSING_API_KEY_MESSAGE } from "./constants";
import type { ResolveAnthropicProviderOptions, ResolvedProvider } from "./types";

export class MissingApiKeyError extends Error {
  constructor() {
    super(MISSING_API_KEY_MESSAGE);
    this.name = "MissingApiKeyError";
  }
}

export function resolveAnthropicProvider(options: ResolveAnthropicProviderOptions = {}): ResolvedProvider {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (apiKey === undefined || apiKey.length === 0) {
    throw new MissingApiKeyError();
  }

  const model = options.model ?? process.env.ASYNCS_MODEL ?? DEFAULT_REVIEW_MODEL;

  const provider = createAnthropicProviderClient({
    apiKey,
    ...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
  });

  return { provider, model };
}
