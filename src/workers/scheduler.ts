import { prisma } from "../libs/prisma";
import cron from "node-cron";

async function handleExpiredTransactions() {
  const now = new Date();
  console.log(`[Worker] Checking expired transactions at ${now.toISOString()}`);

  // EXPIRATION (lebih dari 2 jam - WAITING_PAYMENT)
  const expiredTx = await prisma.transaction.findMany({
    where: {
      status: "WAITING_PAYMENT",
      expiresAt: { lt: now },
    },
  });

  for (const tx of expiredTx) {
    console.log(`Expiring transaction ${tx.id}`);
    await prisma.$transaction(async (trx) => {
      await trx.transaction.update({
        where: { id: tx.id },
        data: { status: "EXPIRED" },
      });

      if (tx.pointsUsedIDR > 0) {
        await trx.user.update({
          where: { id: tx.userId },
          data: { pointsBalance: { increment: tx.pointsUsedIDR } },
        });
      }
    });
  }

  // DECISION TIMEOUT (lebih dari 3 hari - WAITING_CONFIRMATION)
  const canceledTx = await prisma.transaction.findMany({
    where: {
      status: "WAITING_CONFIRMATION",
      decisionDueAt: { lt: now },
    },
  });

  for (const tx of canceledTx) {
    console.log(`Auto-cancel transaction ${tx.id}`);
    await prisma.$transaction(async (trx) => {
      await trx.transaction.update({
        where: { id: tx.id },
        data: { status: "CANCELED" },
      });

      if (tx.pointsUsedIDR > 0) {
        await trx.user.update({
          where: { id: tx.userId },
          data: { pointsBalance: { increment: tx.pointsUsedIDR } },
        });
      }
    });
  }

  console.log(`[Worker] Completed check at ${new Date().toISOString()}`);
}

// Jalankan setiap 5 menit
cron.schedule("*/5 * * * *", async () => {
  try {
    await handleExpiredTransactions();
  } catch (err) {
    console.error("[Worker] Error during transaction check:", err);
  }
});

// Jika file dijalankan langsung
if (require.main === module) {
  console.log("[Worker] Transaction scheduler started...");
  handleExpiredTransactions()
    .then(() => console.log("[Worker] First check complete."))
    .catch((err) => console.error(err));
}

export { handleExpiredTransactions };
