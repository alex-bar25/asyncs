export const DEFAULT_OPENAI_REVIEW_MODEL = "gpt-5.5";

export const DEFAULT_ANTHROPIC_REVIEW_MODEL = "claude-sonnet-4-5";

// Reasoning-model reviews of a full PR diff routinely run past the engine's 60s
// per-call default, so the action gives each specialist more room before retrying.
export const DEFAULT_REVIEW_TIMEOUT_MS = 180_000;

export const REVIEW_COMMENT_MARKER = "<!-- asyncs-review -->";

export const INLINE_COMMENT_MARKER = "<!-- asyncs-inline-finding -->";
