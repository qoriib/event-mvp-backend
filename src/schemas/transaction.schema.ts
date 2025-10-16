import { z } from "zod";

export const createTransactionSchema = z.object({
  body: z.object({
    eventId: z.string().min(1, "Event ID is required"),
    ticketTypeId: z.string().min(1, "Ticket type ID is required"),
    qty: z.number().int().positive("Quantity must be positive"),
    usePoints: z.boolean().optional().default(false),
    promoCode: z.string().optional(),
  }),
});

export const uploadProofSchema = z.object({
  body: z.object({
    paymentProofUrl: z.string().min(3, "Payment proof is required"),
  }),
});

export const updateTransactionStatusSchema = z.object({
  body: z.object({
    status: z.enum(["DONE", "REJECTED", "CANCELED"]),
  }),
});
