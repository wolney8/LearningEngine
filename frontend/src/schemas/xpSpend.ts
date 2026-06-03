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
    xp_remaining: z.number().int().nonnegative(),
    action: z.string().min(1),
    package_id: z.string().min(1),
    difficulty: z.string().nullable(),
    cost: z.number().int().nonnegative(),
    success: z.boolean(),
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
