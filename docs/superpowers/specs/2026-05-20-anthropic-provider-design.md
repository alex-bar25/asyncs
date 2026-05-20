# Anthropic Provider — Design Spec

**Date:** 2026-05-20
**Status:** Drafted, pending Alex review
**Slice:** 1 of 3 toward `asyncs pr review --local` working end-to-end

## Goal

Implement the first concrete `ProviderClient` (Anthropic) so the coordinator and specialist runners can actually call an LLM. This unblocks the rest of the harness work — once a real provider exists, every later harness improvement (smarter consensus, robustness, plugins) can be validated against real model output rather than mocks.

This slice does **not** wire the provider into the CLI yet. That happens after slices 2 (local diff source via `simple-git`) and 3 (`runReviewPipeline` composition + `asyncs pr review --local`).

## Non-goals (explicitly out of scope)

- Reading `ANTHROPIC_API_KEY` from the environment. The provider takes `apiKey` as an explicit constructor arg; env wiring lives in the CLI glue slice.
- OpenAI provider (separate later slice).
- `runReviewPipeline` composition or CLI changes (separate slices 2 + 3).
- Retries, timeouts, bounded concurrency, structured error reporting. These are part of the robustness slice, not provider-implementation.
- Integration tests against the real Anthropic API. Provider gets exercised end-to-end once the full loop closes; for now, only pure helper functions are unit-tested.

## Interface changes in `@asyncs/providers`

Two related changes, both forced by how structured-output APIs work (Anthropic's tool-use, OpenAI's `response_format: json_schema`). Both are designed once now so the second provider doesn't force another breaking change.

### Add `schema` to `ProviderGenerateObjectRequest`

```ts
export type ProviderGenerateObjectRequest = {
  model: string;
  schemaName: string;
  schema: Record<string, unknown>;  // JSON Schema, vendor-neutral
  messages: readonly ProviderMessage[];
};
```

The schema is a JSON Schema object, not a zod schema. Keeping `@asyncs/providers` free of any zod runtime dependency preserves the package's vendor-neutrality. Callers convert their zod schemas via `z.toJSONSchema()` (zod v4 built-in).

### Drop the generic from `generateObject`

Current:

```ts
generateObject?<TObject>(request: ...): Promise<ProviderGenerateObjectResult<TObject>>;
```

New:

```ts
export type ProviderGenerateObjectResult = {
  object: unknown;
  usage?: ProviderUsage;
  rawText?: string;
};

generateObject?(request: ...): Promise<ProviderGenerateObjectResult>;
```

**Reasoning.** The generic was a fiction — the provider has no way to actually guarantee the output type. The caller (runner) already parses with zod, which is where the type narrowing genuinely happens. Dropping the generic:

- Eliminates the last two `as TObject` casts in test stubs (lingering after the recent `as` cleanup).
- Matches the actual trust boundary: provider returns raw structured data; caller decides what shape it must be.
- Avoids a misleading abstraction.

This is a small breaking change to `ProviderClient`, but only the agents-package runners consume it, and they already parse with zod immediately after the call.

## Schema export in `@asyncs/agents`

Add precomputed JSON Schemas alongside the existing zod schemas in `packages/agents/src/schemas.ts`:

```ts
export const CoordinatorAgentOutputJsonSchema = z.toJSONSchema(CoordinatorAgentOutputSchema);
export const SpecialistAgentOutputJsonSchema = z.toJSONSchema(SpecialistAgentOutputSchema);
```

The runners pass these as the `schema` field on each `generateObject` call.

## New file: `packages/providers/src/anthropic.ts`

### Public factory

```ts
export type AnthropicProviderClientOptions = {
  apiKey: string;
  defaultModel?: string;
  maxTokens?: number;
};

export function createAnthropicProviderClient(
  options: AnthropicProviderClientOptions,
): ProviderClient;
```

`defaultModel` is informational only — the request itself carries `model`. We keep it on the options for symmetry with the eventual OpenAI factory and possible future "use defaults when omitted" behavior; not used in this slice.

`maxTokens` defaults to a sensible value (4096). Configurable since coordinator outputs can be long for big PRs.

### `generateText`

1. Split `messages` into a single concatenated `system` string (all role:"system" entries joined by `\n\n`) and the remaining user/assistant entries.
2. Call `client.messages.create({ model, max_tokens, system?, messages })`.
3. Concatenate all `text`-type content blocks from the response.
4. Return `{ text, usage: { inputTokens, outputTokens } }`.

### `generateObject`

1. Split system/non-system messages as above.
2. Call `client.messages.create` with:
   - `tools: [{ name: request.schemaName, description: "...", input_schema: request.schema }]`
   - `tool_choice: { type: "tool", name: request.schemaName }`
3. Find the single `tool_use` block in the response. If none, throw a clear error referencing the schema name.
4. Return `{ object: toolUseBlock.input, usage, rawText: JSON.stringify(toolUseBlock.input) }`. `object` is typed `unknown` — caller (runner) parses with zod.

No `as` casts anywhere in this file. The `unknown` return is the honest type for `tool_use.input`.

### Dependencies

Add `@anthropic-ai/sdk` to `packages/providers/package.json`. No other new deps in this slice (`zod` already on `@asyncs/agents` for the precomputed JSON Schemas).

## Runner changes

`packages/agents/src/runner.ts` updates:

- `runCoordinatorAgent`: pass `schema: CoordinatorAgentOutputJsonSchema` in the request. Result type loses the generic; downstream `CoordinatorAgentOutputSchema.parse(result.object)` already validates and narrows.
- `runSpecialistAgent`: same pattern with `SpecialistAgentOutputJsonSchema`.

## Tests

### What we test in this slice

1. **Message splitting helper** (extract system messages, preserve order of non-system). Unit test in `packages/providers/test/anthropic.test.ts`.
2. **Tool-use unwrapping** — given a fake `Anthropic.Message` with one `tool_use` block, the provider returns its `input` and usage; given a response with no `tool_use`, it throws with the schema name in the message. Unit test, same file.
3. **Existing agent tests** continue passing after the interface change (test stubs lose `as TObject`).

### What we explicitly don't test

- Real Anthropic API calls.
- Network failure handling (no retry logic in this slice).
- Token-counting accuracy (we trust the SDK's reported usage).

### Test strategy for the SDK boundary

Rather than mocking the `@anthropic-ai/sdk` module, we extract the actual SDK call behind a minimal seam: an internal `AnthropicMessagesGateway` type with just `messages.create`. The default implementation wraps `new Anthropic({ apiKey })`. The factory accepts an optional internal-only gateway override for tests. This avoids `mock.module` magic and keeps the production code path trivial.

```ts
// internal — not re-exported from package index
export type AnthropicMessagesGateway = {
  messagesCreate(params: MessageCreateParams): Promise<Message>;
};
```

The exported factory signature stays clean (`{ apiKey, defaultModel?, maxTokens? }`); the gateway is a separate, internal entry point used by tests only.

## Risks and trade-offs

- **JSON Schema produced by `z.toJSONSchema()` may not match Anthropic's strictness expectations exactly.** Mitigation: covered by tests once the loop closes; if it fails on real calls, we tighten schemas iteratively.
- **The interface change ripples through every existing test stub.** Acceptable — the affected surface is small (only `@asyncs/agents` tests have stubs) and the cleanup is mechanical.
- **No retry/timeout in this slice.** A flaky Anthropic API call will bubble up as an unhandled rejection. Documented out-of-scope and immediately addressed by the next robustness slice.

## Acceptance criteria

- `bun run check` green (typecheck, lint, format, all tests).
- `packages/providers/src/anthropic.ts` exists and exports `createAnthropicProviderClient`.
- `ProviderClient.generateObject` accepts a `schema` field and returns `object: unknown`.
- `@asyncs/agents` runners pass JSON Schemas through and parse results with zod.
- No `as` casts introduced. All previously removed `as TObject` casts in tests are eliminated.
- Provider unit tests cover message splitting and tool-use unwrapping (happy path + missing-tool-use error).
