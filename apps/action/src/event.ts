import { z } from "zod";
import type { PullRequestEvent } from "./types";

const PullRequestPayloadSchema = z.object({
  number: z.number().int().positive(),
  pull_request: z.object({
    base: z.object({ sha: z.string().min(1) }),
    head: z.object({ sha: z.string().min(1) }),
  }),
});

export function parsePullRequestEvent(input: {
  eventName: string;
  repository: string;
  payload: unknown;
}): PullRequestEvent {
  if (input.eventName !== "pull_request") {
    throw new Error(`asyncs review expects a pull_request event, received: ${input.eventName}`);
  }

  const [owner, repo] = input.repository.split("/");

  if (owner === undefined || owner.length === 0 || repo === undefined || repo.length === 0) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${input.repository}`);
  }

  const payload = PullRequestPayloadSchema.parse(input.payload);

  return {
    owner,
    repo,
    prNumber: payload.number,
    baseSha: payload.pull_request.base.sha,
    headSha: payload.pull_request.head.sha,
  };
}

export async function readPullRequestEvent(env: Record<string, string | undefined>): Promise<PullRequestEvent> {
  const eventPath = env.GITHUB_EVENT_PATH;

  if (eventPath === undefined || eventPath.length === 0) {
    throw new Error("GITHUB_EVENT_PATH is not set.");
  }

  const payload: unknown = await Bun.file(eventPath).json();

  return parsePullRequestEvent({
    eventName: env.GITHUB_EVENT_NAME ?? "",
    repository: env.GITHUB_REPOSITORY ?? "",
    payload,
  });
}
