import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_ANTHROPIC_REVIEW_MODEL, DEFAULT_OPENAI_REVIEW_MODEL } from "../src/constants";
import { MissingApiKeyError, resolveProvider } from "../src/provider";

const ENV_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ASYNCS_MODEL", "ASYNCS_PROVIDER"] as const;
const savedEnv = new Map<string, string | undefined>();

function clearEnv(): void {
  for (const key of ENV_KEYS) {
    savedEnv.set(key, process.env[key]);
    Reflect.deleteProperty(process.env, key);
  }
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const original = savedEnv.get(key);

    if (original === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = original;
    }
  }

  savedEnv.clear();
});

describe("resolveProvider", () => {
  test("throws MissingApiKeyError when no OpenAI key is available by default", () => {
    clearEnv();
    expect(() => resolveProvider({})).toThrow(MissingApiKeyError);
  });

  test("builds an OpenAI provider by default", () => {
    clearEnv();
    const { provider, model } = resolveProvider({ openAIApiKey: "test-key" });

    expect(provider.kind).toBe("openai");
    expect(model).toBe(DEFAULT_OPENAI_REVIEW_MODEL);
  });

  test("builds an Anthropic provider when requested", () => {
    clearEnv();
    const { provider, model } = resolveProvider({ provider: "anthropic", anthropicApiKey: "test-key" });

    expect(provider.kind).toBe("anthropic");
    expect(model).toBe(DEFAULT_ANTHROPIC_REVIEW_MODEL);
  });

  test("prefers an explicit model option over the default", () => {
    clearEnv();
    const { model } = resolveProvider({ openAIApiKey: "test-key", model: "custom-model" });

    expect(model).toBe("custom-model");
  });

  test("falls back to ASYNCS_MODEL when no model option is given", () => {
    clearEnv();
    process.env.ASYNCS_MODEL = "env-model";
    const { model } = resolveProvider({ openAIApiKey: "test-key" });

    expect(model).toBe("env-model");
  });

  test("falls back to ASYNCS_PROVIDER when no provider option is given", () => {
    clearEnv();
    process.env.ASYNCS_PROVIDER = "anthropic";
    const { provider } = resolveProvider({ anthropicApiKey: "test-key" });

    expect(provider.kind).toBe("anthropic");
  });
});
