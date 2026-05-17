export const BUILT_IN_PROVIDER_KINDS = ["openai", "anthropic"] as const;

export const DEFAULT_PROVIDER_KIND = BUILT_IN_PROVIDER_KINDS[0];

export const PROVIDER_MESSAGE_ROLES = ["system", "user", "assistant"] as const;
