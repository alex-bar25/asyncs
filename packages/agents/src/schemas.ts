import { AgentKindSchema, ConfidenceSchema, ReviewFindingSchema } from "@asyncs/core";
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
