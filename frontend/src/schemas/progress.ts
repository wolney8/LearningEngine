import { z } from "zod";

const DateTimeStringSchema = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "Expected a valid datetime string",
  });

export const UserProgressRecordSchema = z.object({
  package_id: z.string().min(1),
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  attempt_count: z.number().int().positive(),
  first_completed_at: DateTimeStringSchema.nullable(),
  updated_at: DateTimeStringSchema,
});

export const UserProgressUpsertRequestSchema = z.object({
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  attempt_count: z.number().int().positive().optional(),
});

export type UserProgressRecord = z.infer<typeof UserProgressRecordSchema>;
export type UserProgressUpsertRequest = z.infer<typeof UserProgressUpsertRequestSchema>;
