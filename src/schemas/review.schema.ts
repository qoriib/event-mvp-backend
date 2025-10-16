import { z } from "zod";

export const createReviewSchema = z.object({
  body: z.object({
    eventId: z.string().min(1, "Event ID is required"),
    rating: z
      .number()
      .int()
      .min(1, "Minimum rating is 1")
      .max(5, "Maximum rating is 5"),
    comment: z.string().max(500).optional(),
  }),
});

export const updateReviewSchema = z.object({
  body: z.object({
    rating: z
      .number()
      .int()
      .min(1, "Minimum rating is 1")
      .max(5, "Maximum rating is 5")
      .optional(),
    comment: z.string().max(500).optional(),
  }),
});
