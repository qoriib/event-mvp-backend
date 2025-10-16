"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log("Starting seeder...");
    const pwd = await bcrypt_1.default.hash("password", 10);
    // 1. USERS
    const customerNames = [
        "Andi",
        "Budi",
        "Citra",
        "Dewi",
        "Eka",
        "Fajar",
        "Gilang",
        "Hana",
        "Indra",
        "Joko",
        "Kiki",
        "Lina",
    ];
    const users = await Promise.all(customerNames.map((name) => prisma.user.upsert({
        where: { email: `${name.toLowerCase()}@mail.com` },
        update: {},
        create: {
            email: `${name.toLowerCase()}@mail.com`,
            name,
            passwordHash: pwd,
            role: "CUSTOMER",
            pointsBalance: Math.floor(Math.random() * 100000),
        },
    })));
    console.log(`Created ${users.length} customers`);
    // 2. ORGANIZER
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
                    bio: "Professional concert and festival management team.",
                },
            },
        },
    });
    const orgProfile = await prisma.organizerProfile.findUniqueOrThrow({
        where: { userId: organizerUser.id },
    });
    console.log("Organizer created");
    // 3. EVENTS
    const locations = [
        "Jakarta",
        "Bandung",
        "Yogyakarta",
        "Bali",
        "Surabaya",
        "Medan",
        "Semarang",
        "Makassar",
        "Lampung",
        "Malang",
    ];
    const categories = [
        "Music",
        "Festival",
        "Workshop",
        "Seminar",
        "Charity",
        "Art",
        "Conference",
        "Tech",
        "Culture",
        "Startup",
    ];
    const sampleEvents = Array.from({ length: 12 }).map((_, i) => ({
        title: `Event ${i + 1} - ${categories[i % categories.length]} Fiesta`,
        description: "Sebuah acara yang menampilkan berbagai aktivitas menarik dan hiburan live.",
        category: categories[i % categories.length],
        location: locations[i % locations.length],
        startAt: new Date(2025, 5 + (i % 6), 5, 18, 0, 0),
        endAt: new Date(2025, 5 + (i % 6), 6, 23, 0, 0),
        isPaid: i % 3 !== 0,
        capacity: 2000 + i * 100,
        seatsAvailable: 1500 + i * 50,
    }));
    const events = await Promise.all(sampleEvents.map((event) => prisma.event.create({
        data: {
            organizerId: orgProfile.id,
            ...event,
            ticketTypes: {
                create: [
                    {
                        name: "Regular",
                        priceIDR: event.isPaid ? 150000 : 0,
                        quota: 1000,
                    },
                    { name: "VIP", priceIDR: event.isPaid ? 300000 : 0, quota: 500 },
                ],
            },
            promotions: {
                create: [
                    {
                        code: `PROMO${event.title.slice(-1)}`,
                        type: "PERCENT",
                        value: 10,
                        minSpendIDR: 100000,
                        startsAt: new Date("2025-01-01"),
                        endsAt: new Date("2025-12-31"),
                        maxUses: 200,
                    },
                ],
            },
        },
    })));
    console.log(`Created ${events.length} events with tickets and promotions`);
    // 4. TRANSACTIONS
    const allTicketTypes = await prisma.ticketType.findMany();
    const randomTicket = () => allTicketTypes[Math.floor(Math.random() * allTicketTypes.length)];
    const txStatuses = [
        client_1.TxStatus.DONE,
        client_1.TxStatus.WAITING_PAYMENT,
        client_1.TxStatus.WAITING_CONFIRMATION,
        client_1.TxStatus.REJECTED,
    ];
    const transactions = await Promise.all(Array.from({ length: 15 }).map(async (_, i) => {
        const user = users[i % users.length];
        const ticket = randomTicket();
        const price = ticket.priceIDR;
        const qty = 1 + (i % 3);
        const subtotal = price * qty;
        return prisma.transaction.create({
            data: {
                userId: user.id,
                eventId: ticket.eventId,
                status: txStatuses[i % txStatuses.length],
                totalBeforeIDR: subtotal,
                pointsUsedIDR: Math.floor(Math.random() * 5000),
                promoCode: i % 4 === 0 ? "PROMO1" : null,
                promoDiscountIDR: i % 4 === 0 ? subtotal * 0.1 : 0,
                totalPayableIDR: subtotal -
                    (i % 4 === 0 ? subtotal * 0.1 : 0) -
                    Math.floor(Math.random() * 5000),
                expiresAt: new Date(Date.now() + 7200000),
                decisionDueAt: new Date(Date.now() + 3 * 86400000),
                items: {
                    create: [
                        {
                            ticketTypeId: ticket.id,
                            qty,
                            unitPriceIDR: price,
                            lineTotalIDR: subtotal,
                        },
                    ],
                },
                tickets: i % 3 === 0
                    ? {
                        create: [
                            {
                                eventId: ticket.eventId,
                                ticketTypeId: ticket.id,
                                ownerUserId: user.id,
                            },
                        ],
                    }
                    : undefined,
            },
        });
    }));
    console.log(`Created ${transactions.length} transactions`);
    // 5. REVIEWS
    const sampleComments = [
        "Luar biasa! Acara sangat menyenangkan.",
        "Sound system perlu ditingkatkan.",
        "Organisasi sangat baik dan rapi.",
        "Kurang parkiran tapi musiknya keren!",
        "Sangat direkomendasikan, akan datang lagi!",
        "Dekorasi panggung keren sekali!",
        "Antrian masuk agak lama.",
        "Lighting dan ambience luar biasa.",
        "Harga tiket sepadan dengan pengalaman.",
        "MC-nya seru dan profesional.",
    ];
    const usedPairs = new Set();
    const reviews = [];
    for (let i = 0; i < 20; i++) {
        const event = events[i % events.length];
        const user = users[i % users.length];
        const key = `${event.id}-${user.id}`;
        if (usedPairs.has(key))
            continue;
        usedPairs.add(key);
        const rating = 3 + (i % 3);
        reviews.push({
            eventId: event.id,
            userId: user.id,
            rating,
            comment: sampleComments[i % sampleComments.length],
        });
    }
    await prisma.review.createMany({ data: reviews, skipDuplicates: true });
    const reviewAgg = await prisma.review.aggregate({
        _avg: { rating: true },
        _count: { _all: true },
    });
    await prisma.organizerProfile.update({
        where: { id: orgProfile.id },
        data: {
            ratingsAvg: reviewAgg._avg.rating ?? 0,
            ratingsCount: reviewAgg._count._all,
        },
    });
    console.log(`Created ${reviews.length} unique reviews`);
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
//# sourceMappingURL=seed.js.map