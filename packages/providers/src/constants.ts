export const BUILT_IN_PROVIDER_KINDS = ["openai", "anthropic"] as const;

export const PROVIDER_MESSAGE_ROLES = ["system", "user", "assistant"] as const;

const BUILT_IN_PROVIDER_KIND_VALUES: ReadonlySet<string> = new Set(BUILT_IN_PROVIDER_KINDS);

export function isBuiltInProviderKind(kind: string): kind is (typeof BUILT_IN_PROVIDER_KINDS)[number] {
  return BUILT_IN_PROVIDER_KIND_VALUES.has(kind);
}
