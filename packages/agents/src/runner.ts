import { COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME, COORDINATOR_AGENT_STRUCTURED_OUTPUT_ERROR } from "./constants";
import { buildCoordinatorAgentMessages } from "./prompt";
import type { CoordinatorAgentRunResult, CoordinatorAgentOutput, RunCoordinatorAgentOptions } from "./types";

export async function runCoordinatorAgent(options: RunCoordinatorAgentOptions): Promise<CoordinatorAgentRunResult> {
  if (options.provider.generateObject === undefined) {
    throw new Error(COORDINATOR_AGENT_STRUCTURED_OUTPUT_ERROR);
  }

  const result = await options.provider.generateObject<CoordinatorAgentOutput>({
    model: options.model,
    schemaName: COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME,
    messages: buildCoordinatorAgentMessages(options.input),
  });

  return {
    output: result.object,
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    ...(result.rawText === undefined ? {} : { rawText: result.rawText }),
  };
}
