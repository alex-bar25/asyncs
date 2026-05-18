import {
  COORDINATOR_AGENT_OUTPUT_SCHEMA_NAME,
  COORDINATOR_AGENT_STRUCTURED_OUTPUT_ERROR,
  SPECIALIST_AGENT_OUTPUT_SCHEMA_NAME,
  SPECIALIST_AGENT_STRUCTURED_OUTPUT_ERROR,
} from "./constants";
import { buildCoordinatorAgentMessages, buildSpecialistAgentMessages } from "./prompt";
import type {
  CoordinatorAgentRunResult,
  CoordinatorAgentOutput,
  RunCoordinatorAgentOptions,
  RunSpecialistAgentOptions,
  SpecialistAgentOutput,
  SpecialistAgentRunResult,
} from "./types";

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

export async function runSpecialistAgent(options: RunSpecialistAgentOptions): Promise<SpecialistAgentRunResult> {
  if (options.provider.generateObject === undefined) {
    throw new Error(SPECIALIST_AGENT_STRUCTURED_OUTPUT_ERROR);
  }

  const result = await options.provider.generateObject<SpecialistAgentOutput>({
    model: options.model,
    schemaName: SPECIALIST_AGENT_OUTPUT_SCHEMA_NAME,
    messages: buildSpecialistAgentMessages(options),
  });

  return {
    output: result.object,
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    ...(result.rawText === undefined ? {} : { rawText: result.rawText }),
  };
}
