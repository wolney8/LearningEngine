import { z } from "zod";

const DifficultySchema = z.enum(["easy", "normal", "hard", "expert"]);

const DateTimeStringSchema = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "Expected a valid datetime string",
  });

const UserDifficultyProgressSchema = z.object({
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  best_xp_earned: z.number().int().nonnegative(),
  updated_at: DateTimeStringSchema,
});

export const UserProgressRecordSchema = z.object({
  package_id: z.string().min(1),
  difficulty: DifficultySchema,
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  best_xp_earned: z.number().int().nonnegative(),
  difficulty_results: z
    .record(DifficultySchema, UserDifficultyProgressSchema)
    .nullable()
    .optional(),
  attempt_count: z.number().int().positive(),
  first_completed_at: DateTimeStringSchema.nullable(),
  updated_at: DateTimeStringSchema,
});

export const UserProgressUpsertRequestSchema = z.object({
  difficulty: DifficultySchema.optional(),
  latest_weighted_score: z.number().min(0).max(1),
  completed: z.boolean(),
  best_xp_earned: z.number().int().nonnegative().optional(),
  attempt_count: z.number().int().positive().optional(),
});

export type UserProgressRecord = z.infer<typeof UserProgressRecordSchema>;
export type UserProgressUpsertRequest = z.infer<
  typeof UserProgressUpsertRequestSchema
>;
