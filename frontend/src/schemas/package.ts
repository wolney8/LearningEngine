import { z } from "zod";

export const AnswerSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

export const PageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
});

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    difficulty: z.enum(["easy", "normal", "hard", "expert"]).nullable().optional(),
    answers: z.array(AnswerSchema).min(2).max(6),
    correct_answer: z.string().min(1),
    weight: z.number().positive(),
    feedback: z.string().min(1),
    revision_page_ids: z.array(z.string()).default([]),
  })
  .refine((q) => q.answers.some((a) => a.id === q.correct_answer), {
    message: "correct_answer must match an answer id",
    path: ["correct_answer"],
  });

export const PackageSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
    title: z.string().min(1),
    description: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    tags: z.array(z.string()).default([]),
    passing_score: z.number().min(0).max(1).default(0.8),
    pages: z.array(PageSchema).min(1),
    questions: z.array(QuestionSchema).min(1),
  })
  .superRefine((pkg, ctx) => {
    const pageIds = new Set(pkg.pages.map((p) => p.id));
    pkg.questions.forEach((q, qi) => {
      q.revision_page_ids.forEach((rpid, ri) => {
        if (!pageIds.has(rpid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `revision_page_id '${rpid}' does not match any page id`,
            path: ["questions", qi, "revision_page_ids", ri],
          });
        }
      });
    });
  });

export type Answer = z.infer<typeof AnswerSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Package = z.infer<typeof PackageSchema>;

export const PackageSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  tags: z.array(z.string()).default([]),
  passing_score: z.number().min(0).max(1),
  page_count: z.number().int().nonnegative(),
  question_count: z.number().int().nonnegative(),
  enabled: z.boolean().default(true),
  xp_threshold: z.number().int().nonnegative().nullable().default(null),
});

export type PackageSummary = z.infer<typeof PackageSummarySchema>;
