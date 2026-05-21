import { describe, expect, mock, test } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { createAnthropicProviderClient, splitProviderMessages } from "../src/anthropic";

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
    container: null,
    stop_reason: "end_turn",
    stop_details: null,
    stop_sequence: null,
    usage: {
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      input_tokens: usage.input,
      output_tokens: usage.output,
      server_tool_use: null,
      service_tier: null,
    },
  };
}

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
            caller: { type: "direct" },
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

    const firstCallArgs: unknown = messagesCreate.mock.calls[0];
    expect(firstCallArgs).toEqual([
      expect.objectContaining({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4096,
        tools: [
          {
            name: "CoordinatorAgentOutput",
            description: "Return data matching the CoordinatorAgentOutput schema.",
            input_schema: { type: "object", properties: { labels: { type: "array" } } },
          },
        ],
        tool_choice: { type: "tool", name: "CoordinatorAgentOutput" },
      }),
      undefined,
    ]);
  });

  test("throws with the schema name when no tool_use block is returned", async () => {
    const messagesCreate = mock(async () =>
      fakeAnthropicMessage([{ type: "text", text: "I won't use the tool.", citations: null }], { input: 1, output: 2 }),
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
});

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
    const firstCallArgs: unknown = messagesCreate.mock.calls[0];
    expect(firstCallArgs).toEqual([
      {
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 4096,
        system: "Be terse.",
        messages: [{ role: "user", content: "Hi." }],
      },
      undefined,
    ]);
  });

  test("forwards AbortSignal to messagesCreate via options", async () => {
    const controller = new AbortController();
    const messagesCreate = mock<
      (
        params: Anthropic.MessageCreateParamsNonStreaming,
        options?: { signal?: AbortSignal },
      ) => Promise<Anthropic.Message>
    >(async () => fakeAnthropicMessage([{ type: "text", text: "ok", citations: null }], { input: 1, output: 1 }));

    const client = createAnthropicProviderClient({
      apiKey: "test-key",
      gateway: { messagesCreate },
    });

    await client.generateText({
      model: "claude-3-7-sonnet-20250219",
      messages: [{ role: "user", content: "Hi." }],
      signal: controller.signal,
    });

    const optionsArg: unknown = messagesCreate.mock.calls[0]?.[1];
    expect(optionsArg).toEqual({ signal: controller.signal });
  });
});
