import { z } from "zod";

export const UserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["student", "admin"]),
  xp: z.number().int().nonnegative(),
  created_at: z.string().min(1),
});

export const AuthResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("bearer"),
  user: UserSchema,
});

export const LoginRequestSchema = z.object({
  username_or_email: z.string().min(3),
  password: z.string().min(8),
});

export const RegisterRequestSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  selected_package_ids: z.array(z.string().min(1)).default([]),
});

export type User = z.infer<typeof UserSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
