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
