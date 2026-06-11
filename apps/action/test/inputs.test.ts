import { describe, expect, test } from "bun:test";
import { parseReviewOptionsInput } from "../src/inputs";

describe("parseReviewOptionsInput", () => {
  test("returns defaults when both inputs are empty", () => {
    const options = parseReviewOptionsInput({ mode: "", agents: "" });

    expect(options).toEqual({ mode: "low-noise", agents: [] });
  });

  test("returns defaults when inputs are undefined", () => {
    const options = parseReviewOptionsInput({});

    expect(options).toEqual({ mode: "low-noise", agents: [] });
  });

  test("parses a valid mode", () => {
    const options = parseReviewOptionsInput({ mode: "security" });

    expect(options.mode).toBe("security");
  });

  test("parses a comma-separated agent list and trims whitespace", () => {
    const options = parseReviewOptionsInput({ agents: "backend, security ,testing" });

    expect(options.agents).toEqual(["backend", "security", "testing"]);
  });

  test("throws on an invalid mode", () => {
    expect(() => parseReviewOptionsInput({ mode: "loud" })).toThrow('Invalid mode input: "loud"');
  });

  test("throws on an invalid agent kind", () => {
    expect(() => parseReviewOptionsInput({ agents: "backend,wizard" })).toThrow('Invalid agent input: "wizard"');
  });
});
