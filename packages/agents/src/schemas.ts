import { AgentKindSchema, ConfidenceSchema, ReviewFindingSchema } from "@asyncs/core";
import type { ProviderJsonSchema } from "@asyncs/providers";
import { z } from "zod";

export const AgentAssignmentSchema = z.object({
  agent: AgentKindSchema,
  purpose: z.string().min(1),
  files: z.array(z.string().min(1)).readonly(),
  focusAreas: z.array(z.string().min(1)).readonly(),
  context: z.string().min(1),
});

export const CoordinatorAgentOutputSchema = z.object({
  labels: z.array(z.string().min(1)).readonly(),
  assignments: z.array(AgentAssignmentSchema).readonly(),
  confidence: ConfidenceSchema,
  reasoning: z.array(z.string().min(1)).readonly(),
});

export const SpecialistAgentOutputSchema = z.object({
  findings: z.array(ReviewFindingSchema).readonly(),
  summary: z.string().min(1),
});

function asObjectJsonSchema(value: unknown, schemaName: string): ProviderJsonSchema {
  if (typeof value === "object" && value !== null && "type" in value && value.type === "object") {
    return value as ProviderJsonSchema; // narrowed manually because z.toJSONSchema returns a broader JSONSchema type
  }

  throw new Error(`Expected ${schemaName} JSON Schema to describe an object.`);
}

export const CoordinatorAgentOutputJsonSchema: ProviderJsonSchema = asObjectJsonSchema(
  z.toJSONSchema(CoordinatorAgentOutputSchema),
  "CoordinatorAgentOutput",
);

export const SpecialistAgentOutputJsonSchema: ProviderJsonSchema = asObjectJsonSchema(
  z.toJSONSchema(SpecialistAgentOutputSchema),
  "SpecialistAgentOutput",
);
