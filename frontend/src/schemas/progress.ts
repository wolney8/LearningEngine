import { z } from "zod";

export const UserProgressRecordSchema = z.object({
  package_id: z.string().min(1),
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  attempt_count: z.number().int().positive(),
  first_completed_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime(),
});

export const UserProgressUpsertRequestSchema = z.object({
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  attempt_count: z.number().int().positive().optional(),
});

export type UserProgressRecord = z.infer<typeof UserProgressRecordSchema>;
export type UserProgressUpsertRequest = z.infer<
  typeof UserProgressUpsertRequestSchema
>;
