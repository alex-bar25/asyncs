# Anthropic Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first concrete `ProviderClient` (Anthropic) so the coordinator and specialist runners can actually call an LLM, unblocking the rest of the harness work.

**Architecture:** Two-part change. First migrate the `ProviderClient` interface (`@asyncs/providers`) — drop the generic on `generateObject`, add a `schema` field for vendor-neutral JSON Schema. Then implement `createAnthropicProviderClient` in `packages/providers/src/anthropic.ts` using the `@anthropic-ai/sdk`, behind a small internal gateway seam for testability. The seam isolates the SDK so unit tests don't make network calls. Caller (runner) parses provider output with the existing zod schemas — provider returns `unknown`, caller narrows.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes`), Bun + `bun:test`, zod v4 (already on `@asyncs/agents` and `@asyncs/core`), `@anthropic-ai/sdk` (new).

**Spec:** `docs/superpowers/specs/2026-05-20-anthropic-provider-design.md`

---

## File Structure

**Create:**
- `packages/providers/src/anthropic.ts` — `createAnthropicProviderClient` factory, internal `AnthropicMessagesGateway` seam, `splitProviderMessages` helper.
- `packages/providers/test/anthropic.test.ts` — unit tests for message splitting, `generateText`, `generateObject` happy path, `generateObject` missing-tool-use error.

**Modify:**
- `packages/providers/src/types.ts` — add `ProviderJsonSchema` type, add `schema` to `ProviderGenerateObjectRequest`, drop generic on `generateObject` and result type.
- `packages/providers/src/index.ts` — re-export `createAnthropicProviderClient` and `ProviderJsonSchema`.
- `packages/providers/test/index.test.ts` — update existing structured-generation test for new signature (no `as`).
- `packages/providers/package.json` — add `@anthropic-ai/sdk` dependency.
- `packages/agents/src/schemas.ts` — add `CoordinatorAgentOutputJsonSchema` and `SpecialistAgentOutputJsonSchema` (precomputed from zod schemas, narrowed via type guard).
- `packages/agents/src/runner.ts` — drop generic on `generateObject` calls, pass JSON schemas, remove unused type imports.
- `packages/agents/test/index.test.ts` — drop `<TObject>` and `as TObject` from test stubs.
- `packages/orchestration/test/index.test.ts` — same stub cleanup.

Each file has one clear responsibility. `anthropic.ts` stays focused on the Anthropic-specific glue; the gateway seam is the only test hook. Helper extraction (`splitProviderMessages`) is co-located because OpenAI will need a different shape later (no top-level `system` field) — premature abstraction would just bind us to Anthropic's specific shape.

---

## Task 1: Migrate `ProviderClient` interface (atomic refactor)

Touch every consumer in one commit. The `schema` field becomes required but every consumer passes `{}` as a placeholder for now (Task 2 replaces with real JSON Schemas).

**Files:**
- Modify: `packages/providers/src/types.ts`
- Modify: `packages/providers/test/index.test.ts`
- Modify: `packages/agents/src/runner.ts`
- Modify: `packages/agents/test/index.test.ts`
- Modify: `packages/orchestration/test/index.test.ts`

### Steps

- [ ] **Step 1: Update `packages/providers/src/types.ts`**

Replace the existing `ProviderGenerateObjectRequest`, `ProviderGenerateObjectResult`, and `ProviderClient.generateObject` signatures with these:

```ts
export type ProviderJsonSchema = {
  type: "object";
  [key: string]: unknown;
};

export type ProviderGenerateObjectRequest = {
  model: string;
  schemaName: string;
  schema: ProviderJsonSchema;
  messages: readonly ProviderMessage[];
};

export type ProviderGenerateObjectResult = {
  object: unknown;
  usage?: ProviderUsage;
  rawText?: string;
};

export type ProviderClient = {
  kind: ProviderKind;
  generateText(request: ProviderGenerateTextRequest): Promise<ProviderGenerateTextResult>;
  generateObject?(request: ProviderGenerateObjectRequest): Promise<ProviderGenerateObjectResult>;
};
```

- [ ] **Step 2: Update `packages/providers/test/index.test.ts`**

The "defines a structured generation provider client" test currently uses a generic and an `as TObject` cast. Replace its body (the test at lines ~44-74 of the current file) with this:

```ts
test("defines a structured generation provider client", async () => {
  const client = defineProviderClient({
    kind: "anthropic",
    async generateText() {
      return { text: "unused" };
    },
    async generateObject() {
      return {
        object: { labels: ["backend"] },
      };
    },
  });

  if (client.generateObject === undefined) {
    throw new Error("Expected structured generation support.");
  }

  const result = await client.generateObject({
    model: "test-model",
    schemaName: "ReviewPlan",
    schema: { type: "object" },
    messages: [{ role: "user", content: "Plan the review." }],
  });

  expect(result.object).toEqual({ labels: ["backend"] });
});
```

Remove the local `type ReviewPlan` declaration — the test no longer needs it.

- [ ] **Step 3: Update `packages/agents/src/runner.ts`**

Drop the generics on the two `generateObject` calls and add a `schema: { type: "object" }` placeholder. Also remove now-unused type imports `CoordinatorAgentOutput` and `SpecialistAgentOutput` (the runner doesn't reference them anymore — `runCoordinatorAgent` and `runSpecialistAgent` are typed via the return type only).

In `runCoordinatorAgent`, change the body of the function so that the call site reads:

```ts
const result = await options.provider.generateObject({
  model: options.model,
  schemaName: COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME,
  schema: { type: "object" },
  messages: buildCoordinatorAgentMessages(options.input),
});
const parsed = CoordinatorAgentOutputSchema.parse(result.object);
```

Same pattern in `runSpecialistAgent`:

```ts
const result = await options.provider.generateObject({
  model: options.model,
  schemaName: SPECIALIST_AGENT_OUTPUT_SCHEMA_NAME,
  schema: { type: "object" },
  messages: buildSpecialistAgentMessages(options),
});
const parsed = SpecialistAgentOutputSchema.parse(result.object);
```

Adjust the imports at the top to remove the unused output-type names:

```ts
import type {
  CoordinatorAgentRunResult,
  RunCoordinatorAgentOptions,
  RunSpecialistAgentOptions,
  SpecialistAgentRunResult,
} from "./types";
```

- [ ] **Step 4: Update `packages/agents/test/index.test.ts`**

Find both `async generateObject<TObject>(request: ProviderGenerateObjectRequest)` stubs (one in the coordinator structured-provider test, one in the specialist structured-provider test). For each:

1. Drop the `<TObject>` generic from the function signature.
2. Replace `object: output as TObject` with `object: output`.
3. Same for the schema-rejection test stub (line ~437 in the current file) — drop `<TObject>` and the `as TObject`.

For example, the coordinator stub becomes:

```ts
async generateObject(request: ProviderGenerateObjectRequest) {
  capturedModel = request.model;
  capturedSchemaName = request.schemaName;
  capturedMessageText = request.messages.map((message) => message.content).join("\n");

  return {
    object: output,
    rawText: '{"labels":["payments"]}',
    usage: {
      inputTokens: 10,
      outputTokens: 20,
    },
  };
}
```

- [ ] **Step 5: Update `packages/orchestration/test/index.test.ts`**

Same treatment for the single `generateObject<TObject>` stub in this file (around lines 207-228 of the current file). Drop the generic and drop `as TObject` from the `object` return.

- [ ] **Step 6: Run typecheck, lint, format, tests**

Run: `bun run check`

Expected output ends with `0 fail` and `54 pass` (no test count changes in this task — same tests, just adapted to the new signature).

- [ ] **Step 7: Commit**

```bash
git add packages/providers/src/types.ts \
        packages/providers/test/index.test.ts \
        packages/agents/src/runner.ts \
        packages/agents/test/index.test.ts \
        packages/orchestration/test/index.test.ts
git commit -m "$(cat <<'EOF'
refactor: drop generic from ProviderClient.generateObject

Returns object: unknown instead of <TObject>. Caller (runner) already
parses with zod, which is where type narrowing genuinely happens.
Eliminates the last as TObject casts in test stubs.

Also adds required schema: ProviderJsonSchema field on
ProviderGenerateObjectRequest. Vendor-neutral JSON Schema shape
({ type: "object"; [k: string]: unknown }) so the next task can pass
zod-derived schemas without coupling @asyncs/providers to zod.
EOF
)"
```

---

## Task 2: Precompute JSON Schemas and wire through runners

Add precomputed JSON Schemas in `@asyncs/agents/src/schemas.ts`, narrow them to `ProviderJsonSchema` via a type guard, and replace the `{ type: "object" }` placeholders in the runners.

**Files:**
- Modify: `packages/agents/src/schemas.ts`
- Modify: `packages/agents/src/runner.ts`

### Steps

- [ ] **Step 1: Add JSON Schema exports to `packages/agents/src/schemas.ts`**

Add these imports and a private narrowing helper to the file:

```ts
import type { ProviderJsonSchema } from "@asyncs/providers";
```

Then append the following to the file, after the existing schema exports:

```ts
function asObjectJsonSchema(value: unknown, schemaName: string): ProviderJsonSchema {
  if (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "object"
  ) {
    return value as ProviderJsonSchema; // narrowed manually because z.toJSONSchema returns a broader JSONSchema type
  }

  throw new Error(`Expected ${schemaName} JSON Schema to describe an object.`);
}

export const CoordinatorAgentOutputJsonSchema: ProviderJsonSchema = asObjectJsonSchema(
  z.toJSONSchema(CoordinatorAgentOutputSchema),
  "CoordinatorAgentOutput",
);

export const SpecialistAgentOutputJsonSchema: ProviderJsonSchema = asObjectJsonSchema(
  z.toJSONSchema(SpecialistAgentOutputSchema),
  "SpecialistAgentOutput",
);
```

**Important:** the comment is the only place `as` appears in this slice. It exists because TS narrowing via `in`+literal check works at the boolean level but doesn't auto-cast the value to `ProviderJsonSchema`. There is no `as`-free alternative without restating the entire JSON Schema shape (which defeats the purpose of using `z.toJSONSchema`). This single boundary cast is the documented exception.

> **Note for plan reviewers:** If Alex wants strict zero-`as`, the alternative is `const narrowed: ProviderJsonSchema = { ...value, type: "object" }` after the in-check — a spread copy. Slightly wasteful at module load but verifiably cast-free. Trade-off: a runtime copy for one cast at a validated boundary. Flag during code review.

- [ ] **Step 2: Wire schemas into `packages/agents/src/runner.ts`**

Replace the imports section to include the new JSON Schema exports:

```ts
import {
  CoordinatorAgentOutputJsonSchema,
  CoordinatorAgentOutputSchema,
  SpecialistAgentOutputJsonSchema,
  SpecialistAgentOutputSchema,
} from "./schemas";
```

Replace the `schema: { type: "object" }` placeholder in `runCoordinatorAgent` with `schema: CoordinatorAgentOutputJsonSchema`. Replace the same placeholder in `runSpecialistAgent` with `schema: SpecialistAgentOutputJsonSchema`.

- [ ] **Step 3: Run check**

Run: `bun run check`

Expected: same 54 tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/agents/src/schemas.ts packages/agents/src/runner.ts
git commit -m "$(cat <<'EOF'
feat: precompute JSON Schemas for coordinator and specialist output

Adds CoordinatorAgentOutputJsonSchema and SpecialistAgentOutputJsonSchema
via z.toJSONSchema, narrowed to ProviderJsonSchema via a runtime-checked
helper. Runners now pass these through to providers so structured-output
APIs (Anthropic tool_use, OpenAI json_schema) can drive the model.
EOF
)"
```

---

## Task 3: Add `@anthropic-ai/sdk` dependency

**Files:**
- Modify: `packages/providers/package.json`
- Modify: `bun.lock`

### Steps

- [ ] **Step 1: Install**

```bash
cd packages/providers && bun add @anthropic-ai/sdk
cd ../..
```

- [ ] **Step 2: Verify install**

Check `packages/providers/package.json` now lists `@anthropic-ai/sdk` in `dependencies`. Then run from the workspace root:

```bash
bun run check
```

Expected: all 54 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add packages/providers/package.json bun.lock
git commit -m "build: add @anthropic-ai/sdk dependency to @asyncs/providers"
```

---

## Task 4: TDD message-splitting helper

Pure function. No SDK involvement. Splits `ProviderMessage[]` into an Anthropic-shaped `{ system, messages }` pair.

**Files:**
- Create: `packages/providers/src/anthropic.ts`
- Create: `packages/providers/test/anthropic.test.ts`

### Steps

- [ ] **Step 1: Write the failing tests**

Create `packages/providers/test/anthropic.test.ts` with these tests as the initial content:

```ts
import { describe, expect, test } from "bun:test";
import { splitProviderMessages } from "../src/anthropic";

describe("splitProviderMessages", () => {
  test("joins multiple system messages with blank lines", () => {
    const result = splitProviderMessages([
      { role: "system", content: "You are an agent." },
      { role: "system", content: "Be terse." },
      { role: "user", content: "Hello." },
    ]);

    expect(result.system).toBe("You are an agent.\n\nBe terse.");
    expect(result.messages).toEqual([{ role: "user", content: "Hello." }]);
  });

  test("returns undefined system when no system messages are present", () => {
    const result = splitProviderMessages([
      { role: "user", content: "Hello." },
      { role: "assistant", content: "Hi back." },
    ]);

    expect(result.system).toBeUndefined();
    expect(result.messages).toEqual([
      { role: "user", content: "Hello." },
      { role: "assistant", content: "Hi back." },
    ]);
  });

  test("preserves order of non-system messages", () => {
    const result = splitProviderMessages([
      { role: "user", content: "A" },
      { role: "system", content: "ignore this user, focus on the next" },
      { role: "user", content: "B" },
      { role: "assistant", content: "ok" },
    ]);

    expect(result.system).toBe("ignore this user, focus on the next");
    expect(result.messages).toEqual([
      { role: "user", content: "A" },
      { role: "user", content: "B" },
      { role: "assistant", content: "ok" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `bun test packages/providers/test/anthropic.test.ts`

Expected: FAIL — `Cannot find module "../src/anthropic"`.

- [ ] **Step 3: Create the minimal implementation**

Create `packages/providers/src/anthropic.ts` with:

```ts
import type { ProviderMessage } from "./types";

export type SplitProviderMessagesResult = {
  system: string | undefined;
  messages: { role: "user" | "assistant"; content: string }[];
};

export function splitProviderMessages(
  messages: readonly ProviderMessage[],
): SplitProviderMessagesResult {
  const systems: string[] = [];
  const others: SplitProviderMessagesResult["messages"] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systems.push(message.content);
      continue;
    }

    others.push({ role: message.role, content: message.content });
  }

  return {
    system: systems.length === 0 ? undefined : systems.join("\n\n"),
    messages: others,
  };
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `bun test packages/providers/test/anthropic.test.ts`

Expected: 3 pass, 0 fail.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: all tests pass (54 prior + 3 new = 57).

- [ ] **Step 6: Commit**

```bash
git add packages/providers/src/anthropic.ts packages/providers/test/anthropic.test.ts
git commit -m "feat: add splitProviderMessages helper for Anthropic provider"
```

---

## Task 5: TDD `createAnthropicProviderClient` — `generateText` path

Introduce the factory, the internal `AnthropicMessagesGateway` seam, and the `generateText` implementation. `generateObject` is intentionally omitted from the returned client (it's optional on `ProviderClient`) — Task 6 adds it.

**Files:**
- Modify: `packages/providers/src/anthropic.ts`
- Modify: `packages/providers/test/anthropic.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Append to `packages/providers/test/anthropic.test.ts`:

```ts
import { mock } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicProviderClient } from "../src/anthropic";

function fakeAnthropicMessage(
  content: Anthropic.ContentBlock[],
  usage: { input: number; output: number },
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

describe("createAnthropicProviderClient.generateText", () => {
  test("returns concatenated text and usage with system message extracted", async () => {
    const messagesCreate = mock(async () =>
      fakeAnthropicMessage(
        [
          { type: "text", text: "First. ", citations: null },
          { type: "text", text: "Second.", citations: null },
        ],
        { input: 12, output: 34 },
      ),
    );

    const client = createAnthropicProviderClient({
      apiKey: "test-key",
      gateway: { messagesCreate },
    });

    const result = await client.generateText({
      model: "claude-3-7-sonnet-20250219",
      messages: [
        { role: "system", content: "Be terse." },
        { role: "user", content: "Hi." },
      ],
    });

    expect(result.text).toBe("First. Second.");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 34 });
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(messagesCreate.mock.calls[0]?.[0]).toEqual({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4096,
      system: "Be terse.",
      messages: [{ role: "user", content: "Hi." }],
    });
  });
});
```

> **Note:** if the `@anthropic-ai/sdk` version pinned in `bun.lock` exposes a different `Anthropic.Usage` shape than the one used in `fakeAnthropicMessage` above, fix the test fixture to include the exact required fields. Don't bypass typecheck.

- [ ] **Step 2: Run test to confirm failure**

Run: `bun test packages/providers/test/anthropic.test.ts -t generateText`

Expected: FAIL — `createAnthropicProviderClient` is not exported.

- [ ] **Step 3: Implement the factory and `generateText`**

Append to `packages/providers/src/anthropic.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  ProviderClient,
  ProviderGenerateTextRequest,
  ProviderGenerateTextResult,
} from "./types";

const DEFAULT_MAX_TOKENS = 4096;

export type AnthropicMessagesGateway = {
  messagesCreate(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message>;
};

export type AnthropicProviderClientOptions = {
  apiKey: string;
  defaultModel?: string;
  maxTokens?: number;
  gateway?: AnthropicMessagesGateway;
};

export function createAnthropicProviderClient(
  options: AnthropicProviderClientOptions,
): ProviderClient {
  const gateway = options.gateway ?? createDefaultGateway(options.apiKey);
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  return {
    kind: "anthropic",
    async generateText(
      request: ProviderGenerateTextRequest,
    ): Promise<ProviderGenerateTextResult> {
      const split = splitProviderMessages(request.messages);
      const response = await gateway.messagesCreate({
        model: request.model,
        max_tokens: maxTokens,
        ...(split.system === undefined ? {} : { system: split.system }),
        messages: split.messages,
      });
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

function createDefaultGateway(apiKey: string): AnthropicMessagesGateway {
  const client = new Anthropic({ apiKey });

  return {
    messagesCreate(params) {
      return client.messages.create(params);
    },
  };
}
```

- [ ] **Step 4: Run test to confirm pass**

Run: `bun test packages/providers/test/anthropic.test.ts -t generateText`

Expected: PASS.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: all tests pass (57 prior + 1 new = 58).

- [ ] **Step 6: Commit**

```bash
git add packages/providers/src/anthropic.ts packages/providers/test/anthropic.test.ts
git commit -m "$(cat <<'EOF'
feat: add createAnthropicProviderClient with generateText

Implements the Anthropic provider's text-generation path via
@anthropic-ai/sdk. System-role messages are joined and surfaced via
the Anthropic top-level `system` field; user/assistant messages
preserve order. The factory takes an explicit apiKey; an optional
gateway override exists for testability (no env-var reading here).
EOF
)"
```

---

## Task 6: TDD `generateObject` — happy path

Add `generateObject` to the returned client. Uses Anthropic's tool-use with forced `tool_choice` to obtain structured output.

**Files:**
- Modify: `packages/providers/src/anthropic.ts`
- Modify: `packages/providers/test/anthropic.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Append to `packages/providers/test/anthropic.test.ts`:

```ts
describe("createAnthropicProviderClient.generateObject", () => {
  test("forwards schema and unwraps tool_use input", async () => {
    const toolInput = { labels: ["payments"], assignments: [] };
    const messagesCreate = mock(async () =>
      fakeAnthropicMessage(
        [
          {
            type: "tool_use",
            id: "tool_test",
            name: "CoordinatorAgentOutput",
            input: toolInput,
          },
        ],
        { input: 5, output: 8 },
      ),
    );

    const client = createAnthropicProviderClient({
      apiKey: "test-key",
      gateway: { messagesCreate },
    });

    if (client.generateObject === undefined) {
      throw new Error("Expected generateObject support.");
    }

    const result = await client.generateObject({
      model: "claude-3-7-sonnet-20250219",
      schemaName: "CoordinatorAgentOutput",
      schema: { type: "object", properties: { labels: { type: "array" } } },
      messages: [{ role: "user", content: "Plan the review." }],
    });

    expect(result.object).toEqual(toolInput);
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 8 });
    expect(result.rawText).toBe(JSON.stringify(toolInput));

    const call = messagesCreate.mock.calls[0]?.[0];
    expect(call?.model).toBe("claude-3-7-sonnet-20250219");
    expect(call?.max_tokens).toBe(4096);
    expect(call?.tools).toEqual([
      {
        name: "CoordinatorAgentOutput",
        description: "Return data matching the CoordinatorAgentOutput schema.",
        input_schema: { type: "object", properties: { labels: { type: "array" } } },
      },
    ]);
    expect(call?.tool_choice).toEqual({ type: "tool", name: "CoordinatorAgentOutput" });
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `bun test packages/providers/test/anthropic.test.ts -t "generateObject"`

Expected: FAIL — `client.generateObject` is undefined.

- [ ] **Step 3: Add `generateObject` to the factory**

In `packages/providers/src/anthropic.ts`, also import these types:

```ts
import type {
  ProviderClient,
  ProviderGenerateObjectRequest,
  ProviderGenerateObjectResult,
  ProviderGenerateTextRequest,
  ProviderGenerateTextResult,
} from "./types";
```

Then add a `generateObject` method to the returned `ProviderClient` (insert after `generateText`):

```ts
    async generateObject(
      request: ProviderGenerateObjectRequest,
    ): Promise<ProviderGenerateObjectResult> {
      const split = splitProviderMessages(request.messages);
      const response = await gateway.messagesCreate({
        model: request.model,
        max_tokens: maxTokens,
        ...(split.system === undefined ? {} : { system: split.system }),
        messages: split.messages,
        tools: [
          {
            name: request.schemaName,
            description: `Return data matching the ${request.schemaName} schema.`,
            input_schema: request.schema,
          },
        ],
        tool_choice: { type: "tool", name: request.schemaName },
      });
      const toolUseBlock = response.content.find((block) => block.type === "tool_use");

      if (toolUseBlock === undefined || toolUseBlock.type !== "tool_use") {
        throw new Error(
          `Anthropic provider did not return a tool_use block for ${request.schemaName}.`,
        );
      }

      return {
        object: toolUseBlock.input,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        rawText: JSON.stringify(toolUseBlock.input),
      };
    },
```

(The duplicated `block.type !== "tool_use"` check after `find` is for TS narrowing — `Array.prototype.find` does not produce a type guard on the resulting value.)

- [ ] **Step 4: Run test to confirm pass**

Run: `bun test packages/providers/test/anthropic.test.ts -t "generateObject"`

Expected: PASS.

- [ ] **Step 5: Full check**

Run: `bun run check`

Expected: all tests pass (58 prior + 1 new = 59).

- [ ] **Step 6: Commit**

```bash
git add packages/providers/src/anthropic.ts packages/providers/test/anthropic.test.ts
git commit -m "$(cat <<'EOF'
feat: add generateObject to Anthropic provider via tool_use

Implements structured output by defining a single tool whose
input_schema is the caller-supplied JSON Schema and forcing
tool_choice on it. The tool_use block's input is returned as
unknown; the caller (agent runner) parses it with zod.
EOF
)"
```

---

## Task 7: TDD `generateObject` — missing-tool-use error

Cover the error path where Anthropic returns no `tool_use` block (e.g., model refused or the SDK contract changed).

**Files:**
- Modify: `packages/providers/test/anthropic.test.ts`

### Steps

- [ ] **Step 1: Write the failing test**

Append to the existing `describe("createAnthropicProviderClient.generateObject", ...)` block in `packages/providers/test/anthropic.test.ts`:

```ts
  test("throws with the schema name when no tool_use block is returned", async () => {
    const messagesCreate = mock(async () =>
      fakeAnthropicMessage(
        [{ type: "text", text: "I won't use the tool.", citations: null }],
        { input: 1, output: 2 },
      ),
    );

    const client = createAnthropicProviderClient({
      apiKey: "test-key",
      gateway: { messagesCreate },
    });

    if (client.generateObject === undefined) {
      throw new Error("Expected generateObject support.");
    }

    await expect(
      client.generateObject({
        model: "claude-3-7-sonnet-20250219",
        schemaName: "CoordinatorAgentOutput",
        schema: { type: "object" },
        messages: [{ role: "user", content: "Plan the review." }],
      }),
    ).rejects.toThrow("did not return a tool_use block for CoordinatorAgentOutput");
  });
```

- [ ] **Step 2: Run test to confirm pass**

Run: `bun test packages/providers/test/anthropic.test.ts -t "tool_use"`

Expected: PASS — the implementation from Task 6 already throws this exact error; this test just locks in the contract.

If it fails, double-check the message in `anthropic.ts` matches `did not return a tool_use block for ${request.schemaName}` exactly.

- [ ] **Step 3: Commit**

```bash
git add packages/providers/test/anthropic.test.ts
git commit -m "test: lock in missing-tool-use error contract for Anthropic provider"
```

---

## Task 8: Re-export from package index + final verification

Surface the factory and the JSON Schema type to consumers.

**Files:**
- Modify: `packages/providers/src/index.ts`

### Steps

- [ ] **Step 1: Update `packages/providers/src/index.ts`**

Replace the file contents with:

```ts
export * from "./anthropic";
export * from "./constants";
export * from "./registry";
export type * from "./types";
```

Order matters less than correctness — `anthropic.ts` re-exports `splitProviderMessages` and `createAnthropicProviderClient` and types; `types.ts` is type-only via `export type *`.

- [ ] **Step 2: Verify no consumer regressions**

Run: `bun run check`

Expected: typecheck clean, lint clean, format clean, all 60 tests pass.

- [ ] **Step 3: Smoke-check the public surface**

Print the package exports to confirm the new names are reachable:

```bash
bun -e 'import("./packages/providers/src/index.ts").then((m) => console.log(Object.keys(m).sort()))'
```

Expected output (alphabetical) includes at minimum:

- `BUILT_IN_PROVIDER_KINDS`
- `DEFAULT_PROVIDER_KIND`
- `PROVIDER_MESSAGE_ROLES`
- `createAnthropicProviderClient`
- `createProviderRegistry`
- `defineProviderClient`
- `isBuiltInProviderKind`
- `splitProviderMessages`

(`ProviderJsonSchema` is type-only and won't appear at runtime — that's expected.)

- [ ] **Step 4: Commit**

```bash
git add packages/providers/src/index.ts
git commit -m "feat: export Anthropic provider factory from @asyncs/providers"
```

---

## Done — what's left after this slice

After this plan completes, the Anthropic provider exists and is unit-tested, but nothing in the running system uses it yet. The CLI still wires to the canned-data preview pipeline.

The next two slices close the loop end-to-end:

- **Slice 2:** local diff source via `simple-git` to produce real `ChangedFile[]` from the working tree.
- **Slice 3:** `runReviewPipeline` composition in `@asyncs/orchestration` + CLI `pr review --local` path that reads `ANTHROPIC_API_KEY` from env, constructs the provider, and runs the real pipeline.

Each slice is its own brainstorming → spec → plan cycle.

---

## Self-Review Notes

(Run after writing the plan; fix issues inline. Recorded here for posterity.)

1. **Spec coverage:** Walked through each spec section.
   - Interface changes (schema field + dropped generic) → Task 1 ✓
   - Schema export in agents → Task 2 ✓
   - `packages/providers/src/anthropic.ts` (factory, generateText, generateObject) → Tasks 4-6 ✓
   - Dependency add → Task 3 ✓
   - Runner updates → Task 1 (signature) + Task 2 (schemas) ✓
   - Tests (message splitting, tool-use unwrap happy + error) → Tasks 4, 6, 7 ✓
   - Out-of-scope items explicitly preserved (no env reading, no pipeline composition).

2. **Placeholder scan:** No `TBD`, `TODO`, "implement later", or "appropriate error handling" anywhere. Every step has either code or an exact command with expected output.

3. **Type consistency:**
   - `ProviderJsonSchema` defined in Task 1, used in Task 2, used in Task 6.
   - `AnthropicMessagesGateway.messagesCreate` defined in Task 5, used in Task 5/6/7 tests.
   - `SplitProviderMessagesResult` defined in Task 4, used in Task 5 impl (`split.system`, `split.messages`).
   - `splitProviderMessages` named consistently across all tasks.

4. **One acknowledged exception:** Task 2 contains a single documented `as ProviderJsonSchema` cast at a validated runtime boundary, with a marked alternative (spread copy) flagged for review. Every other task is `as`-free.
