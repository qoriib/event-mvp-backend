import { z } from "zod";

export const createEventSchema = z.object({
  body: z.object({
    title: z.string().min(3, "Title must be at least 3 characters long"),
    description: z.string().optional(),
    category: z.string().optional(),
    location: z.string().min(3, "Location must be at least 3 characters long"),
    startAt: z.string().refine((v) => !isNaN(Date.parse(v)), {
      message: "Invalid start date format",
    }),
    endAt: z.string().refine((v) => !isNaN(Date.parse(v)), {
      message: "Invalid end date format",
    }),
    isPaid: z.boolean().default(false),
    capacity: z.number().int().positive("Capacity must be a positive number"),
    ticketTypes: z
      .array(
        z.object({
          name: z.string().min(1, "Ticket name is required"),
          priceIDR: z.number().int().nonnegative("Price must be ≥ 0"),
          quota: z.number().int().positive().optional(),
        })
      )
      .optional(),
  }),
});

export const updateEventSchema = z.object({
  body: z.object({
    title: z.string().min(3).optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    location: z.string().min(3).optional(),
    startAt: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), {
        message: "Invalid start date format",
      }),
    endAt: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), {
        message: "Invalid end date format",
      }),
    isPaid: z.boolean().optional(),
    capacity: z.number().int().positive().optional(),
  }),
});
