import { z } from "zod";

export const turnsBodySchema = z.object({
  message: z.string().optional(),
  expectedCurrentTurn: z.number().int().min(0).max(15),
});

export type TurnsBody = z.infer<typeof turnsBodySchema>;

export const completeBodySchema = z.object({
  expectedCurrentTurn: z.number().int().min(0).max(15),
});

export type CompleteBody = z.infer<typeof completeBodySchema>;
