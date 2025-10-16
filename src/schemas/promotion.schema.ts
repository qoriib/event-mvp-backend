import { z } from "zod";

export const createPromotionSchema = z.object({
  body: z.object({
    eventId: z.string().min(1, "Event ID is required"),
    code: z.string().min(3, "Code must be at least 3 characters"),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.number().int().positive("Value must be greater than 0"),
    minSpendIDR: z.number().int().nonnegative().default(0),
    startsAt: z.coerce.date({ message: "Invalid start date" }),
    endsAt: z.coerce.date({ message: "Invalid end date" }),
    maxUses: z.number().int().positive().optional(),
  }),
});

export const updatePromotionSchema = z.object({
  body: z.object({
    code: z.string().min(3).optional(),
    type: z.enum(["PERCENT", "FLAT"]).optional(),
    value: z.number().int().positive().optional(),
    minSpendIDR: z.number().int().nonnegative().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    maxUses: z.number().int().positive().optional(),
  }),
});
