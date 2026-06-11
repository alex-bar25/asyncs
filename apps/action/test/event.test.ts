import { describe, expect, test } from "bun:test";
import { parsePullRequestEvent } from "../src/event";

const validPayload = {
  number: 7,
  pull_request: {
    base: { sha: "base-sha" },
    head: { sha: "head-sha" },
  },
};

describe("parsePullRequestEvent", () => {
  test("extracts owner, repo, prNumber, and SHAs from a pull_request event", () => {
    const event = parsePullRequestEvent({
      eventName: "pull_request",
      repository: "alex-bar25/asyncs",
      payload: validPayload,
    });

    expect(event).toEqual({
      owner: "alex-bar25",
      repo: "asyncs",
      prNumber: 7,
      baseSha: "base-sha",
      headSha: "head-sha",
    });
  });

  test("throws when the event is not a pull_request", () => {
    expect(() =>
      parsePullRequestEvent({ eventName: "push", repository: "alex-bar25/asyncs", payload: validPayload }),
    ).toThrow();
  });

  test("throws when the payload is missing the head SHA", () => {
    expect(() =>
      parsePullRequestEvent({
        eventName: "pull_request",
        repository: "alex-bar25/asyncs",
        payload: { number: 7, pull_request: { base: { sha: "base-sha" } } },
      }),
    ).toThrow();
  });

  test("throws when GITHUB_REPOSITORY is malformed", () => {
    expect(() =>
      parsePullRequestEvent({ eventName: "pull_request", repository: "no-slash", payload: validPayload }),
    ).toThrow();
  });
});
