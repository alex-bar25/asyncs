import { describe, expect, mock, test } from "bun:test";
import type { Response, ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { createOpenAIProviderClient } from "../src/openai";

function fakeOpenAIResponse(outputText: string, usage: { input: number; output: number }): Response {
  return {
    id: "resp_test",
    created_at: 0,
    output_text: outputText,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: "gpt-4.1",
    object: "response",
    output: [
      {
        id: "msg_test",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: outputText, annotations: [] }],
      },
    ],
    parallel_tool_calls: false,
    temperature: null,
    tool_choice: "auto",
    tools: [],
    top_p: null,
    usage: {
      input_tokens: usage.input,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: usage.output,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: usage.input + usage.output,
    },
  };
}

describe("createOpenAIProviderClient.generateText", () => {
  test("returns output text and usage", async () => {
    const responsesCreate = mock(async () => fakeOpenAIResponse("Reviewed.", { input: 12, output: 34 }));
    const client = createOpenAIProviderClient({
      apiKey: "test-key",
      gateway: { responsesCreate },
    });

    const result = await client.generateText({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: "Be precise." },
        { role: "user", content: "Review this PR." },
      ],
    });

    expect(result.text).toBe("Reviewed.");
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 34 });
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    const firstCallArgs: unknown = responsesCreate.mock.calls[0];
    expect(firstCallArgs).toEqual([
      {
        model: "gpt-4.1",
        max_output_tokens: 4096,
        instructions: "Be precise.",
        input: [{ role: "user", content: "Review this PR." }],
      },
      undefined,
    ]);
  });

  test("forwards AbortSignal to responsesCreate via options", async () => {
    const controller = new AbortController();
    const responsesCreate = mock<
      (params: ResponseCreateParamsNonStreaming, options?: { signal?: AbortSignal }) => Promise<Response>
    >(async () => fakeOpenAIResponse("ok", { input: 1, output: 1 }));
    const client = createOpenAIProviderClient({
      apiKey: "test-key",
      gateway: { responsesCreate },
    });

    await client.generateText({
      model: "gpt-4.1",
      messages: [{ role: "user", content: "Hi." }],
      signal: controller.signal,
    });

    const optionsArg: unknown = responsesCreate.mock.calls[0]?.[1];
    expect(optionsArg).toEqual({ signal: controller.signal });
  });
});

describe("createOpenAIProviderClient.generateObject", () => {
  test("requests JSON schema output and parses the response text", async () => {
    const output = { labels: ["backend"], assignments: [] };
    const responsesCreate = mock(async () => fakeOpenAIResponse(JSON.stringify(output), { input: 5, output: 8 }));
    const client = createOpenAIProviderClient({
      apiKey: "test-key",
      gateway: { responsesCreate },
    });

    if (client.generateObject === undefined) {
      throw new Error("Expected generateObject support.");
    }

    const result = await client.generateObject({
      model: "gpt-4.1",
      schemaName: "CoordinatorAgentOutput",
      schema: { type: "object", properties: { labels: { type: "array" } } },
      messages: [{ role: "user", content: "Plan the review." }],
    });

    expect(result.object).toEqual(output);
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 8 });
    expect(result.rawText).toBe(JSON.stringify(output));
    const firstCallArgs: unknown = responsesCreate.mock.calls[0];
    expect(firstCallArgs).toEqual([
      {
        model: "gpt-4.1",
        max_output_tokens: 4096,
        input: [{ role: "user", content: "Plan the review." }],
        text: {
          format: {
            type: "json_schema",
            name: "CoordinatorAgentOutput",
            strict: false,
            schema: { type: "object", properties: { labels: { type: "array" } } },
          },
        },
      },
      undefined,
    ]);
  });

  test("throws with the schema name when JSON cannot be parsed", async () => {
    const responsesCreate = mock(async () => fakeOpenAIResponse("not json", { input: 1, output: 2 }));
    const client = createOpenAIProviderClient({
      apiKey: "test-key",
      gateway: { responsesCreate },
    });

    if (client.generateObject === undefined) {
      throw new Error("Expected generateObject support.");
    }

    await expect(
      client.generateObject({
        model: "gpt-4.1",
        schemaName: "CoordinatorAgentOutput",
        schema: { type: "object" },
        messages: [{ role: "user", content: "Plan the review." }],
      }),
    ).rejects.toThrow("OpenAI provider did not return valid JSON for CoordinatorAgentOutput");
  });
});
