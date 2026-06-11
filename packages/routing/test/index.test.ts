import { describe, expect, test } from "bun:test";
import type { ReviewRequest } from "@asyncs/core";
import { AUTO_AGENT_KINDS_BY_MODE, resolveAgentRoute, resolveAgentRoutes } from "../src/index";

const baseRequest: ReviewRequest = {
  mode: "low-noise",
  agents: [],
};

describe("agent routing", () => {
  test("exports auto agent defaults by review mode", () => {
    expect(AUTO_AGENT_KINDS_BY_MODE["low-noise"]).toEqual(["backend", "security", "architecture", "testing"]);
    expect(AUTO_AGENT_KINDS_BY_MODE.security).toEqual(["security"]);
  });

  test("uses mode defaults when no agents are requested", () => {
    const route = resolveAgentRoute(baseRequest);

    expect(route.source).toBe("auto");
    expect(route.agents.map((agent) => agent.kind)).toEqual(["backend", "security", "architecture", "testing"]);
  });

  test("uses explicit requested agents when provided", () => {
    const route = resolveAgentRoute({
      ...baseRequest,
      agents: ["security", "backend"],
    });

    expect(route.source).toBe("explicit");
    expect(route.agents.map((agent) => agent.kind)).toEqual(["security", "backend"]);
  });

  test("uses specialist defaults for narrow modes", () => {
    const route = resolveAgentRoute({
      ...baseRequest,
      mode: "testing",
    });

    expect(route.agents.map((agent) => agent.kind)).toEqual(["testing"]);
  });

  test("resolves multiple review requests", () => {
    const routes = resolveAgentRoutes([
      baseRequest,
      {
        ...baseRequest,
        mode: "security",
      },
    ]);

    expect(routes).toHaveLength(2);
    expect(routes[1]?.agents.map((agent) => agent.kind)).toEqual(["security"]);
  });
});
