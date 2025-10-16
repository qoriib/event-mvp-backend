import { Router } from "express";
import { prisma } from "../libs/prisma";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateSchema } from "../middlewares/validate";
import {
  createPromotionSchema,
  updatePromotionSchema,
} from "../schemas/promotion.schema";

const router = Router();

/**
 * GET /api/promotions
 * Menampilkan semua promo (dapat difilter berdasarkan eventId)
 */
router.get("/", async (req, res) => {
  try {
    const { eventId } = req.query;

    const promotions = await prisma.promotion.findMany({
      where: eventId ? { eventId: String(eventId) } : {},
      orderBy: { startsAt: "desc" },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            category: true,
            location: true,
            startAt: true,
          },
        },
      },
    });

    res.json({ data: promotions });
  } catch (err) {
    console.error("Error fetching promotions:", err);
    res.status(500).json({ error: "Failed to fetch promotions" });
  }
});

/**
 * POST /api/promotions
 * Membuat promo baru (khusus ORGANIZER)
 */
router.post(
  "/",
  requireAuth,
  requireRole("ORGANIZER"),
  validateSchema(createPromotionSchema),
  async (req, res) => {
    try {
      const {
        eventId,
        code,
        type,
        value,
        minSpendIDR,
        startsAt,
        endsAt,
        maxUses,
      } = req.body;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
      });
      if (!event) return res.status(404).json({ error: "Event not found" });

      const existing = await prisma.promotion.findFirst({
        where: { eventId, code },
      });
      if (existing)
        return res
          .status(400)
          .json({ error: "Promotion code already exists for this event" });

      const promotion = await prisma.promotion.create({
        data: {
          eventId,
          code,
          type,
          value,
          minSpendIDR,
          startsAt,
          endsAt,
          maxUses,
        },
      });

      res.status(201).json({
        message: "Promotion created successfully",
        data: promotion,
      });
    } catch (err) {
      console.error("Error creating promotion:", err);
      res.status(500).json({ error: "Failed to create promotion" });
    }
  }
);

/**
 * PUT /api/promotions/:id
 * Update promo (khusus ORGANIZER)
 */
router.put(
  "/:id",
  requireAuth,
  requireRole("ORGANIZER"),
  validateSchema(updatePromotionSchema),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.promotion.findUnique({ where: { id } });
      if (!existing)
        return res.status(404).json({ error: "Promotion not found" });

      const updated = await prisma.promotion.update({
        where: { id },
        data: req.body,
      });

      res.json({
        message: "Promotion updated successfully",
        data: updated,
      });
    } catch (err) {
      console.error("Error updating promotion:", err);
      res.status(500).json({ error: "Failed to update promotion" });
    }
  }
);

/**
 * DELETE /api/promotions/:id
 * Menghapus promo (khusus ORGANIZER)
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("ORGANIZER"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await prisma.promotion.findUnique({ where: { id } });
      if (!existing)
        return res.status(404).json({ error: "Promotion not found" });

      await prisma.promotion.delete({ where: { id } });

      res.json({ message: "Promotion deleted successfully" });
    } catch (err) {
      console.error("Error deleting promotion:", err);
      res.status(500).json({ error: "Failed to delete promotion" });
    }
  }
);

export default router;
