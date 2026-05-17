import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_PROVIDER_KINDS,
  DEFAULT_PROVIDER_KIND,
  PROVIDER_MESSAGE_ROLES,
  createProviderRegistry,
  defineProviderClient,
  isBuiltInProviderKind,
  type ProviderClient,
} from "../src/index";

describe("provider contracts", () => {
  test("exports built-in provider vocabulary", () => {
    expect(BUILT_IN_PROVIDER_KINDS).toEqual(["openai", "anthropic"]);
    expect(DEFAULT_PROVIDER_KIND).toBe("openai");
    expect(PROVIDER_MESSAGE_ROLES).toEqual(["system", "user", "assistant"]);
    expect(isBuiltInProviderKind("openai")).toBe(true);
    expect(isBuiltInProviderKind("local")).toBe(false);
  });

  test("defines a text generation provider client", async () => {
    const client = defineProviderClient({
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
    });

    const result = await client.generateText({
      model: "test-model",
      messages: [{ role: "user", content: "Review this PR." }],
    });

    expect(result.text).toBe("Review this PR.");
    expect(result.usage?.outputTokens).toBe(5);
  });

  test("defines a structured generation provider client", async () => {
    type ReviewPlan = {
      labels: string[];
    };

    const client = defineProviderClient({
      kind: "anthropic",
      async generateText() {
        return { text: "unused" };
      },
      async generateObject<TObject>() {
        return {
          object: {
            labels: ["backend"],
          } as TObject,
        };
      },
    });

    if (client.generateObject === undefined) {
      throw new Error("Expected structured generation support.");
    }

    const result = await client.generateObject<ReviewPlan>({
      model: "test-model",
      schemaName: "ReviewPlan",
      messages: [{ role: "user", content: "Plan the review." }],
    });

    expect(result.object.labels).toEqual(["backend"]);
  });

  test("registers and retrieves provider clients", () => {
    const client: ProviderClient = defineProviderClient({
      kind: "custom",
      async generateText() {
        return { text: "ok" };
      },
    });
    const registry = createProviderRegistry([client]);

    expect(registry.get("custom")).toBe(client);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.list()).toEqual([client]);
  });
});
