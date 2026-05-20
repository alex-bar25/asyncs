import { z } from "zod";
import { AGENT_KINDS, CHANGED_FILE_STATUSES, REVIEW_CONFIDENCES, REVIEW_MODES, REVIEW_SEVERITIES } from "./constants";

export const SeveritySchema = z.enum(REVIEW_SEVERITIES);
export const ConfidenceSchema = z.enum(REVIEW_CONFIDENCES);
export const ReviewModeSchema = z.enum(REVIEW_MODES);
export const AgentKindSchema = z.enum(AGENT_KINDS);
export const ChangedFileStatusSchema = z.enum(CHANGED_FILE_STATUSES);

export const ReviewFindingSchema = z.object({
  agent: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  severity: SeveritySchema,
  confidence: ConfidenceSchema,
  file: z.string().min(1).optional(),
  line: z.number().int().positive().optional(),
  evidence: z.string().min(1),
  recommendation: z.string().min(1),
});
