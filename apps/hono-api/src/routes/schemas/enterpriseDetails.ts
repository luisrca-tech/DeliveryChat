import { z } from "zod";

const optionalString = (max: number) =>
  z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().min(1).max(max).optional(),
  );

const optionalTeamSize = z.preprocess(
  (val) =>
    val === "" || val === null || val === undefined || Number.isNaN(Number(val))
      ? undefined
      : val,
  z.coerce.number().int().min(1).max(1_000_000).optional(),
);

export const enterpriseDetailsSchema = z
  .object({
    fullName: z.string().min(1).max(200),
    email: z.string().email(),
    phone: optionalString(50),
    teamSize: optionalTeamSize,
    notes: optionalString(4000),
  })
  .strict();
