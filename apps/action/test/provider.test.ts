import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_REVIEW_MODEL } from "../src/constants";
import { MissingApiKeyError, resolveAnthropicProvider } from "../src/provider";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ASYNCS_MODEL"] as const;
const savedEnv = new Map<string, string | undefined>();

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = savedEnv.get(key);

    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }

  savedEnv.clear();
});

describe("resolveAnthropicProvider", () => {
  test("throws MissingApiKeyError when no key is available", () => {
    clearEnv();
    expect(() => resolveAnthropicProvider({})).toThrow(MissingApiKeyError);
  });

  test("builds an Anthropic provider from an explicit apiKey with the default model", () => {
    clearEnv();
    const { provider, model } = resolveAnthropicProvider({ apiKey: "test-key" });

    expect(provider.kind).toBe("anthropic");
    expect(model).toBe(DEFAULT_REVIEW_MODEL);
  });

  test("prefers an explicit model option over the default", () => {
    clearEnv();
    const { model } = resolveAnthropicProvider({ apiKey: "test-key", model: "custom-model" });

    expect(model).toBe("custom-model");
  });

  test("falls back to ASYNCS_MODEL when no model option is given", () => {
    clearEnv();
    process.env.ASYNCS_MODEL = "env-model";
    const { model } = resolveAnthropicProvider({ apiKey: "test-key" });

    expect(model).toBe("env-model");
  });
});
