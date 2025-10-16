import { Router } from "express";
import { prisma } from "../libs/prisma";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateSchema } from "../middlewares/validate";
import {
  createTransactionSchema,
  updateTransactionStatusSchema,
} from "../schemas/transaction.schema";
import { TxStatus } from "@prisma/client";
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

      // === Tentukan status awal ===
      const initialStatus =
        totalPayable <= 0 ? "WAITING_CONFIRMATION" : "WAITING_PAYMENT";

      // === Buat transaksi ===
      const transaction = await prisma.transaction.create({
        data: {
          userId: user.id,
          eventId,
          status: initialStatus,
          totalBeforeIDR: subtotal,
          pointsUsedIDR: pointsUsed,
          promoCode: promoCode ?? null,
          promoDiscountIDR: promoDiscount,
          totalPayableIDR: totalPayable,
          expiresAt:
            initialStatus === "WAITING_PAYMENT"
              ? new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 jam
              : new Date(Date.now()), // langsung aktif untuk gratis
          decisionDueAt:
            initialStatus === "WAITING_CONFIRMATION"
              ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 hari
              : null,
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
          event: {
            select: {
              id: true,
              title: true,
              location: true,
              ticketTypes: {
                select: {
                  id: true,
                  name: true,
                  priceIDR: true,
                  quota: true,
                },
              },
            },
          },
          items: {
            include: {
              ticketType: { select: { id: true, name: true, priceIDR: true } },
            },
          },
        },
      });

      res.status(201).json({
        message:
          totalPayable <= 0
            ? "Free ticket claimed successfully — no payment required"
            : "Transaction created successfully",
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

      // === Validasi file ===
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "File bukti pembayaran wajib diunggah." });
      }

      // === Ambil transaksi ===
      const transaction = await prisma.transaction.findUnique({
        where: { id },
        include: { user: true, event: true },
      });
      if (!transaction)
        return res.status(404).json({ error: "Transaksi tidak ditemukan." });

      // === Pastikan transaksi milik user yang sedang login ===
      if (transaction.userId !== req.user!.id) {
        return res
          .status(403)
          .json({ error: "Tidak diizinkan mengunggah bukti pembayaran ini." });
      }

      // === Pastikan status masih menunggu pembayaran ===
      if (transaction.status !== TxStatus.WAITING_PAYMENT) {
        return res.status(400).json({
          error: `Tidak dapat upload bukti untuk transaksi dengan status ${transaction.status}.`,
        });
      }

      // === Simpan file bukti ke DB ===
      const proofUrl = `/uploads/${req.file.filename}`;
      const updated = await prisma.transaction.update({
        where: { id },
        data: {
          paymentProofUrl: proofUrl,
          paymentProofAt: new Date(),
          status: TxStatus.WAITING_CONFIRMATION,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          event: {
            select: {
              id: true,
              title: true,
              location: true,
              startAt: true,
              endAt: true,
              ticketTypes: {
                select: { id: true, name: true, priceIDR: true },
              },
            },
          },
          items: {
            include: {
              ticketType: {
                select: { id: true, name: true, priceIDR: true },
              },
            },
          },
        },
      });

      return res.json({
        message: "Bukti pembayaran berhasil diunggah.",
        data: updated,
      });
    } catch (err: any) {
      console.error("Error uploading proof:", err);
      return res.status(500).json({
        error: "Terjadi kesalahan saat mengunggah bukti pembayaran.",
      });
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

/**
 * GET /api/transactions/:id/status
 * Menampilkan transaksi (Khusus Organizer)
 */
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
