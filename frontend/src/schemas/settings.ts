import { z } from "zod";

const MinCorrectForXPSettingsSchema = z
  .object({
    easy: z.number().int().nonnegative(),
    normal: z.number().int().nonnegative(),
    hard: z.number().int().nonnegative(),
    expert: z.number().int().nonnegative(),
  })
  .strict();

const XPSettingsSchema = z
  .object({
    lesson_base_xp_per_correct: z.number().int().nonnegative(),
    first_completion_bonus: z.number().int().nonnegative(),
    attempt_multipliers: z
      .object({
        "1": z.number().nonnegative(),
        "2": z.number().nonnegative(),
        "3": z.number().nonnegative(),
      })
      .strict(),
    hard_expert_exit_penalty: z.number().int().nonnegative(),
    hard_expert_low_answer_penalty: z.number().int().nonnegative(),
    min_correct_for_xp: MinCorrectForXPSettingsSchema,
  })
  .strict();

const DifficultySettingsSchema = z
  .object({
    seconds_per_question: z
      .object({
        easy: z.number().int().nonnegative(),
        normal: z.number().int().nonnegative(),
        hard: z.number().int().nonnegative(),
        expert: z.number().int().nonnegative(),
      })
      .strict(),
    xp_multiplier: z
      .object({
        easy: z.number().nonnegative(),
        normal: z.number().nonnegative(),
        hard: z.number().nonnegative(),
        expert: z.number().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const SettingsSchema = z
  .object({
    version: z.number().int().nonnegative(),
    xp: XPSettingsSchema,
    difficulty: DifficultySettingsSchema,
  })
  .strict();

export type Settings = z.infer<typeof SettingsSchema>;
