import { PrismaClient, TxStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seeder...");

  // === 1. USERS & ORGANIZERS ===
  const pwd = await bcrypt.hash("password", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@eventify.com" },
    update: {},
    create: {
      email: "admin@eventify.com",
      name: "Admin User",
      passwordHash: pwd,
      role: "ADMIN",
    },
  });

  const organizerUser = await prisma.user.upsert({
    where: { email: "soundwave@eventify.com" },
    update: {},
    create: {
      email: "soundwave@eventify.com",
      name: "Soundwave Organizer",
      passwordHash: pwd,
      role: "ORGANIZER",
      organizer: {
        create: {
          displayName: "Soundwave Productions",
          bio: "Top-tier event organizer focusing on live music experiences.",
        },
      },
    },
  });

  const users = await Promise.all(
    ["andi", "budi", "citra"].map((name) =>
      prisma.user.upsert({
        where: { email: `${name}@mail.com` },
        update: {},
        create: {
          email: `${name}@mail.com`,
          name,
          passwordHash: pwd,
          role: "CUSTOMER",
          pointsBalance: Math.floor(Math.random() * 50000),
        },
      })
    )
  );

  console.log("Users and organizer created");

  // === 2. ORGANIZER PROFILE ===
  const orgProfile = await prisma.organizerProfile.findUniqueOrThrow({
    where: { userId: organizerUser.id },
  });

  // === 3. EVENTS + Tickets + Promotions ===
  const now = new Date();
  const events = await prisma.$transaction([
    prisma.event.create({
      data: {
        organizerId: orgProfile.id,
        title: "Summer Beats Festival",
        description:
          "Two days of music, art, and food. Featuring top artists and immersive experiences.",
        category: "Music",
        location: "Jakarta",
        startAt: new Date("2025-08-12T15:00:00Z"),
        endAt: new Date("2025-08-13T23:00:00Z"),
        isPaid: true,
        capacity: 5000,
        seatsAvailable: 4800,
        ticketTypes: {
          create: [
            { name: "Regular", priceIDR: 250000, quota: 4000 },
            { name: "VIP", priceIDR: 500000, quota: 800 },
          ],
        },
        promotions: {
          create: [
            {
              code: "EARLY10",
              type: "PERCENT",
              value: 10,
              minSpendIDR: 100000,
              startsAt: new Date("2025-06-01"),
              endsAt: new Date("2025-08-01"),
              maxUses: 100,
            },
          ],
        },
      },
    }),
    prisma.event.create({
      data: {
        organizerId: orgProfile.id,
        title: "Indie Night Showcase",
        description: "A gathering of indie musicians and local talents.",
        category: "Festival",
        location: "Bandung",
        startAt: new Date("2025-04-20T18:00:00Z"),
        endAt: new Date("2025-04-21T23:00:00Z"),
        isPaid: false,
        capacity: 2000,
        seatsAvailable: 2000,
        ticketTypes: {
          create: [{ name: "Free Pass", priceIDR: 0, quota: 2000 }],
        },
      },
    }),
  ]);

  console.log("Events created");

  // === 4. TRANSACTIONS ===
  const customer = users[0];
  const summerEvent = events[0];
  const ticketType = await prisma.ticketType.findFirstOrThrow({
    where: { eventId: summerEvent.id, name: "Regular" },
  });

  const tx1 = await prisma.transaction.create({
    data: {
      userId: customer.id,
      eventId: summerEvent.id,
      status: TxStatus.DONE,
      totalBeforeIDR: 250000,
      totalPayableIDR: 250000,
      expiresAt: new Date(Date.now() + 7200000),
      decisionDueAt: new Date(Date.now() + 3 * 86400000),
      items: {
        create: [
          {
            ticketTypeId: ticketType.id,
            qty: 1,
            unitPriceIDR: 250000,
            lineTotalIDR: 250000,
          },
        ],
      },
      tickets: {
        create: [
          {
            eventId: summerEvent.id,
            ticketTypeId: ticketType.id,
            ownerUserId: customer.id,
          },
        ],
      },
    },
  });

  // Transaction waiting for payment
  const tx2 = await prisma.transaction.create({
    data: {
      userId: users[1].id,
      eventId: summerEvent.id,
      status: TxStatus.WAITING_PAYMENT,
      totalBeforeIDR: 500000,
      totalPayableIDR: 500000,
      expiresAt: new Date(Date.now() + 7200000),
      decisionDueAt: new Date(Date.now() + 3 * 86400000),
      items: {
        create: [
          {
            ticketTypeId: ticketType.id,
            qty: 2,
            unitPriceIDR: 250000,
            lineTotalIDR: 500000,
          },
        ],
      },
    },
  });

  console.log("Transactions created");

  // === 5. REVIEWS ===
  const review = await prisma.review.create({
    data: {
      eventId: summerEvent.id,
      userId: customer.id,
      rating: 5,
      comment: "Amazing event! Great sound and vibes all night.",
    },
  });

  // Update average rating on organizer
  const agg = await prisma.review.aggregate({
    where: { eventId: summerEvent.id },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await prisma.organizerProfile.update({
    where: { id: orgProfile.id },
    data: {
      ratingsAvg: agg._avg.rating ?? 0,
      ratingsCount: agg._count._all,
    },
  });

  console.log("Review added");

  // === 6. POINT LEDGER ===
  await prisma.pointLedger.createMany({
    data: [
      {
        userId: customer.id,
        deltaIDR: +20000,
        reason: "Bonus points for attending event",
      },
      {
        userId: users[1].id,
        deltaIDR: -10000,
        reason: "Used for ticket discount",
        refTxId: tx2.id,
      },
    ],
  });

  console.log("Points ledger created");

  console.log("Seeder completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seeder error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
