import { z } from "zod";

export const XpSpendActionSchema = z.enum(["difficulty_unlock", "package_unlock"]);

export const XpSpendRequestSchema = z
  .object({
    action: XpSpendActionSchema,
    package_id: z.string().min(1),
    difficulty: z.enum(["hard", "expert"]).optional(),
  })
  .strict();

export const XpSpendResponseSchema = z
  .object({
    id: z.number().int().nonnegative().optional(),
    xp_remaining: z.number().int().nonnegative(),
    action: z.string().min(1),
    package_id: z.string().min(1),
    difficulty: z.string().nullable(),
    cost: z.number().int().nonnegative(),
    success: z.boolean(),
    status: z.enum(["pending", "succeeded", "failed"]).optional(),
    refunded: z.boolean().optional(),
    xp: z.number().int().nonnegative().optional(),
    idempotency_key: z.string().nullable().optional(),
    failure_reason: z.string().nullable().optional(),
    created_at: z.string().datetime().optional(),
    updated_at: z.string().datetime().optional(),
    latest_unlocked_difficulties: z
      .object({
        hard: z.boolean(),
        expert: z.boolean(),
      })
      .optional(),
  })
  .strict();

export const UnlockedDifficultiesSchema = z
  .object({
    hard: z.boolean(),
    expert: z.boolean(),
  })
  .strict();

export type XpSpendAction = z.infer<typeof XpSpendActionSchema>;
export type XpSpendRequest = z.infer<typeof XpSpendRequestSchema>;
export type XpSpendResponse = z.infer<typeof XpSpendResponseSchema>;
export type UnlockedDifficulties = z.infer<typeof UnlockedDifficultiesSchema>;
