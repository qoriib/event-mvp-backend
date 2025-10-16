import { Router } from "express";
import { prisma } from "../libs/prisma";
import { requireAuth } from "../middlewares/auth";
import { validateSchema } from "../middlewares/validate";
import {
  createReviewSchema,
  updateReviewSchema,
} from "../schemas/review.schema";

const router = Router();

/**
 * GET /api/reviews
 * Menampilkan semua review (opsional: filter by eventId)
 */
router.get("/", async (req, res) => {
  try {
    const { eventId } = req.query;

    const reviews = await prisma.review.findMany({
      where: eventId ? { eventId: String(eventId) } : {},
      include: {
        user: { select: { name: true } },
        event: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: reviews });
  } catch (err) {
    console.error("Error fetching reviews:", err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/**
 * POST /api/reviews
 * Membuat review baru (hanya user yang sudah menyelesaikan transaksi)
 */
router.post(
  "/",
  requireAuth,
  validateSchema(createReviewSchema),
  async (req, res) => {
    try {
      const { eventId, rating, comment } = req.body;
      const userId = req.user!.id;

      // Periksa apakah user pernah punya transaksi DONE untuk event ini
      const validPurchase = await prisma.transaction.findFirst({
        where: {
          userId,
          eventId,
          status: "DONE",
        },
      });

      if (!validPurchase) {
        return res.status(403).json({
          error:
            "You can only review events you have attended (completed transaction).",
        });
      }

      // Pastikan belum pernah review event yang sama
      const existingReview = await prisma.review.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });

      if (existingReview) {
        return res.status(400).json({
          error: "You have already reviewed this event.",
        });
      }

      // Buat review baru
      const review = await prisma.review.create({
        data: {
          eventId,
          userId,
          rating,
          comment,
        },
      });

      // Update rata-rata rating pada OrganizerProfile
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { organizer: true },
      });

      if (event) {
        const avg = await prisma.review.aggregate({
          where: { eventId },
          _avg: { rating: true },
          _count: { rating: true },
        });

        await prisma.organizerProfile.update({
          where: { id: event.organizerId },
          data: {
            ratingsAvg: avg._avg.rating ?? 0,
            ratingsCount: avg._count.rating,
          },
        });
      }

      res.status(201).json({
        message: "Review created successfully",
        data: review,
      });
    } catch (err) {
      console.error("Error creating review:", err);
      res.status(500).json({ error: "Failed to create review" });
    }
  }
);

export default router;
