import { describe, expect, test } from "bun:test";
import { BUILT_IN_PROVIDER_KINDS, PROVIDER_MESSAGE_ROLES, type ProviderClient } from "../src/index";

describe("provider contracts", () => {
  test("exports built-in provider vocabulary", () => {
    expect(BUILT_IN_PROVIDER_KINDS).toEqual(["openai", "anthropic"]);
    expect(PROVIDER_MESSAGE_ROLES).toEqual(["system", "user", "assistant"]);
  });

  test("supports a text generation provider client", async () => {
    const client: ProviderClient = {
      kind: "openai",
      async generateText(request) {
        return {
          text: request.messages.map((message) => message.content).join("\n"),
          usage: {
            inputTokens: 3,
            outputTokens: 5,
          },
        };
      },
    };

    const result = await client.generateText({
      model: "test-model",
      messages: [{ role: "user", content: "Review this PR." }],
    });

    expect(result.text).toBe("Review this PR.");
    expect(result.usage?.outputTokens).toBe(5);
  });

  test("supports a structured generation provider client", async () => {
    const client: ProviderClient = {
      kind: "anthropic",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject() {
        return {
          object: { labels: ["backend"] },
        };
      },
    };

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
});
