import { Router } from "express";
import { prisma } from "../libs/prisma";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateSchema } from "../middlewares/validate";
import {
  createTransactionSchema,
  uploadProofSchema,
  updateTransactionStatusSchema,
} from "../schemas/transaction.schema";
import { upload } from "../middlewares/upload";

const router = Router();

/**
 * GET /api/transactions
 * Mendapatkan daftar transaksi milik user login
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user!.id },
      include: {
        event: {
          select: { title: true, location: true, startAt: true, endAt: true },
        },
        items: {
          include: {
            ticketType: { select: { name: true, priceIDR: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: transactions });
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/**
 * POST /api/transactions
 * Membuat transaksi baru (checkout tiket)
 */
router.post(
  "/",
  requireAuth,
  validateSchema(createTransactionSchema),
  async (req, res) => {
    try {
      const { eventId, ticketTypeId, qty, usePoints, promoCode } = req.body;

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: { ticketTypes: true },
      });
      if (!event) return res.status(404).json({ error: "Event not found" });

      const ticketType = event.ticketTypes.find((t) => t.id === ticketTypeId);
      if (!ticketType)
        return res.status(400).json({ error: "Invalid ticket type" });

      const unitPrice = ticketType.priceIDR;
      const subtotal = unitPrice * qty;

      // === Apply promo ===
      let promoDiscount = 0;
      if (promoCode) {
        const promo = await prisma.promotion.findFirst({
          where: {
            eventId,
            code: promoCode,
            startsAt: { lte: new Date() },
            endsAt: { gte: new Date() },
          },
        });
        if (!promo)
          return res
            .status(400)
            .json({ error: "Invalid or expired promo code" });

        promoDiscount =
          promo.type === "PERCENT"
            ? Math.floor((promo.value / 100) * subtotal)
            : promo.value;
      }

      // === Apply points ===
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
      });
      if (!user) return res.status(404).json({ error: "User not found" });

      let pointsUsed = 0;
      if (usePoints && user.pointsBalance > 0) {
        pointsUsed = Math.min(user.pointsBalance, subtotal - promoDiscount);
        await prisma.user.update({
          where: { id: user.id },
          data: { pointsBalance: { decrement: pointsUsed } },
        });
      }

      const totalPayable = subtotal - promoDiscount - pointsUsed;

      // === Create transaction + item ===
      const transaction = await prisma.transaction.create({
        data: {
          userId: user.id,
          eventId,
          status: "WAITING_PAYMENT",
          totalBeforeIDR: subtotal,
          pointsUsedIDR: pointsUsed,
          promoCode: promoCode ?? null,
          promoDiscountIDR: promoDiscount,
          totalPayableIDR: totalPayable,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 jam
          items: {
            create: [
              {
                ticketTypeId,
                qty,
                unitPriceIDR: unitPrice,
                lineTotalIDR: subtotal,
              },
            ],
          },
        },
        include: {
          event: { select: { title: true, location: true } },
          items: { include: { ticketType: { select: { name: true } } } },
        },
      });

      res.status(201).json({
        message: "Transaction created successfully",
        data: transaction,
      });
    } catch (err) {
      console.error("Error creating transaction:", err);
      res.status(500).json({ error: "Failed to create transaction" });
    }
  }
);

/**
 * POST /api/transactions/:id/proof
 * Upload bukti pembayaran (file upload)
 */
router.post(
  "/:id/proof",
  requireAuth,
  upload.single("paymentProof"),
  async (req: any, res) => {
    try {
      const { id } = req.params;
      const file = req.file;

      if (!file) {
        return res
          .status(400)
          .json({ error: "No payment proof file uploaded" });
      }

      // ✅ URL publik tanpa /api prefix
      const paymentProofUrl = `/uploads/${file.filename}`;

      const tx = await prisma.transaction.findUnique({
        where: { id, userId: req.user!.id },
      });
      if (!tx) return res.status(404).json({ error: "Transaction not found" });

      // Izinkan upload ulang jika masih menunggu konfirmasi
      if (!["WAITING_PAYMENT", "WAITING_CONFIRMATION"].includes(tx.status)) {
        return res.status(400).json({ error: "Invalid transaction state" });
      }

      // Update transaksi
      const updated = await prisma.transaction.update({
        where: { id },
        data: {
          paymentProofUrl,
          paymentProofAt: new Date(),
          status: "WAITING_CONFIRMATION",
          decisionDueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      });

      res.json({
        message: "Payment proof uploaded successfully",
        data: {
          ...updated,
          paymentProofUrl, // kirim path publik langsung
        },
      });
    } catch (err) {
      console.error("Error uploading proof:", err);
      res.status(500).json({ error: "Failed to upload payment proof" });
    }
  }
);

/**
 * PUT /api/transactions/:id/status
 * Organizer/Admin mengubah status transaksi
 */
router.put(
  "/:id/status",
  requireAuth,
  requireRole("ORGANIZER"),
  validateSchema(updateTransactionStatusSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const tx = await prisma.transaction.findUnique({
        where: { id },
        include: {
          user: true,
          event: { select: { organizerId: true } },
        },
      });
      if (!tx) return res.status(404).json({ error: "Transaction not found" });

      if (req.user!.role === "ORGANIZER") {
        const organizer = await prisma.organizerProfile.findUnique({
          where: { userId: req.user!.id },
        });
        if (!organizer)
          return res.status(404).json({ error: "Organizer profile not found" });

        if (tx.event?.organizerId !== organizer.id) {
          return res
            .status(403)
            .json({ error: "Unauthorized to update this transaction" });
        }
      }

      const updated = await prisma.transaction.update({
        where: { id },
        data: { status },
      });

      // rollback points jika dibatalkan/rejected
      if (["CANCELED", "REJECTED", "EXPIRED"].includes(status)) {
        await prisma.user.update({
          where: { id: tx.userId },
          data: { pointsBalance: { increment: tx.pointsUsedIDR } },
        });
      }

      res.json({
        message: "Transaction status updated successfully",
        data: updated,
      });
    } catch (err) {
      console.error("Error updating status:", err);
      res.status(500).json({ error: "Failed to update transaction status" });
    }
  }
);

router.get(
  "/manage",
  requireAuth,
  requireRole("ORGANIZER"),
  async (req, res) => {
    try {
      const { status } = req.query as { status?: string };

      const where: any = {};
      if (status) {
        where.status = status;
      }

      if (req.user!.role === "ORGANIZER") {
        const organizer = await prisma.organizerProfile.findUnique({
          where: { userId: req.user!.id },
        });
        if (!organizer) {
          return res.status(404).json({ error: "Organizer profile not found" });
        }

        where.event = { organizerId: organizer.id };
      }

      const transactions = await prisma.transaction.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: {
            select: {
              id: true,
              title: true,
              startAt: true,
              endAt: true,
              location: true,
            },
          },
          items: {
            include: {
              ticketType: { select: { name: true, priceIDR: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ data: transactions });
    } catch (err) {
      console.error("Error fetching managed transactions:", err);
      res.status(500).json({ error: "Failed to fetch managed transactions" });
    }
  }
);

export default router;
