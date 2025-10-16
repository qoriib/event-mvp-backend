import { Router } from "express";
import { prisma } from "../libs/prisma";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateSchema } from "../middlewares/validate";
import { createEventSchema, updateEventSchema } from "../schemas/event.schema";

const router = Router();

/**
 * GET /api/events
 * Menampilkan daftar event (public)
 */
router.get("/mine", requireAuth, requireRole("ORGANIZER"), async (req, res) => {
  try {
    let organizerId: string | undefined;

    if (req.user!.role === "ORGANIZER") {
      const organizer = await prisma.organizerProfile.findUnique({
        where: { userId: req.user!.id },
      });
      if (!organizer) {
        return res.status(404).json({ error: "Organizer profile not found" });
      }
      organizerId = organizer.id;
    }

    const events = await prisma.event.findMany({
      where: organizerId ? { organizerId } : {},
      include: {
        organizer: { select: { displayName: true, ratingsAvg: true } },
        ticketTypes: true,
        promotions: true,
        reviews: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: events });
  } catch (err) {
    console.error("Error fetching organizer events:", err);
    res.status(500).json({ error: "Failed to fetch organizer events" });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      search,
      category,
      location,
      from,
      to,
      page = "1",
      limit = "12",
    } = req.query as Record<string, string>;

    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 12;
    const skip = (pageNum - 1) * pageSize;

    const where: any = {};

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) where.category = category;
    if (location) where.location = { contains: location, mode: "insensitive" };

    if (from || to) {
      where.startAt = {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        include: {
          organizer: { select: { displayName: true, ratingsAvg: true } },
          ticketTypes: true,
          promotions: { where: { endsAt: { gt: new Date() } } },
          reviews: true,
        },
        orderBy: { startAt: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.event.count({ where }),
    ]);

    res.json({
      data: events,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

/**
 * GET /api/events/:id
 * Mendapatkan detail event
 */
router.get("/:id", async (req, res) => {
  try {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        organizer: { include: { user: { select: { email: true } } } },
        ticketTypes: true,
        promotions: true,
        reviews: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (err) {
    console.error("Error fetching event details:", err);
    res.status(500).json({ error: "Failed to fetch event details" });
  }
});

/**
 * POST /api/events
 * Membuat event baru
 */
router.post(
  "/",
  requireAuth,
  requireRole("ORGANIZER"),
  validateSchema(createEventSchema),
  async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        location,
        startAt,
        endAt,
        isPaid,
        capacity,
        ticketTypes,
      } = req.body;

      const organizer = await prisma.organizerProfile.findUnique({
        where: { userId: req.user!.id },
      });

      if (!organizer) {
        return res.status(403).json({ error: "Organizer profile not found" });
      }

      const event = await prisma.event.create({
        data: {
          organizerId: organizer.id,
          title,
          description,
          category,
          location,
          startAt: new Date(startAt),
          endAt: new Date(endAt),
          isPaid,
          capacity,
          seatsAvailable: capacity,
          ticketTypes: {
            create:
              ticketTypes?.map((t: any) => ({
                name: t.name,
                priceIDR: t.priceIDR,
                quota: t.quota ?? null,
              })) ?? [],
          },
        },
        include: { ticketTypes: true },
      });

      res.status(201).json(event);
    } catch (err) {
      console.error("Error creating event:", err);
      res.status(500).json({ error: "Failed to create event" });
    }
  }
);

/**
 * PUT /api/events/:id
 * Memperbarui event
 */
router.put(
  "/:id",
  requireAuth,
  requireRole("ORGANIZER"),
  validateSchema(updateEventSchema),
  async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        category,
        location,
        startAt,
        endAt,
        isPaid,
        capacity,
      } = req.body;

      const organizer = await prisma.organizerProfile.findUnique({
        where: { userId: req.user!.id },
      });

      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (organizer && event.organizerId !== organizer.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const updated = await prisma.event.update({
        where: { id },
        data: {
          title,
          description,
          category,
          location,
          startAt: startAt ? new Date(startAt) : undefined,
          endAt: endAt ? new Date(endAt) : undefined,
          isPaid,
          capacity,
          seatsAvailable: capacity ?? event.seatsAvailable,
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("Error updating event:", err);
      res.status(500).json({ error: "Failed to update event" });
    }
  }
);

/**
 * DELETE /api/events/:id
 * Menghapus event
 */
router.delete(
  "/:id",
  requireAuth,
  requireRole("ORGANIZER"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const organizer = await prisma.organizerProfile.findUnique({
        where: { userId: req.user!.id },
      });

      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return res.status(404).json({ error: "Event not found" });

      if (organizer && event.organizerId !== organizer.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await prisma.event.delete({ where: { id } });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting event:", err);
      res.status(500).json({ error: "Failed to delete event" });
    }
  }
);

/**
 * GET /api/events/organizers/:id
 * Mendapatkan detail lengkap organizer beserta event dan review
 */
router.get("/organizers/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Ambil data organizer + relasi
    const organizer = await prisma.organizerProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
        events: {
          include: {
            ticketTypes: true,
            promotions: true,
            reviews: {
              include: {
                user: { select: { name: true } },
              },
            },
          },
          orderBy: { startAt: "asc" },
        },
      },
    });

    if (!organizer) {
      return res.status(404).json({ error: "Organizer not found" });
    }

    // Ambil semua review yang ditulis untuk event milik organizer ini
    const organizerReviews = await prisma.review.findMany({
      where: {
        event: { organizerId: id },
      },
      include: {
        user: { select: { name: true } },
        event: { select: { title: true, startAt: true, location: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      id: organizer.id,
      displayName: organizer.displayName,
      bio: organizer.bio,
      ratingsAvg: organizer.ratingsAvg,
      ratingsCount: organizer.ratingsCount,
      user: organizer.user,
      events: organizer.events.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        category: e.category,
        location: e.location,
        startAt: e.startAt,
        endAt: e.endAt,
        isPaid: e.isPaid,
        capacity: e.capacity,
        seatsAvailable: e.seatsAvailable,
        ticketTypes: e.ticketTypes,
        promotions: e.promotions,
        reviews: e.reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt,
          user: r.user,
        })),
      })),
      reviews: organizerReviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: r.user,
        event: r.event,
      })),
    });
  } catch (err) {
    console.error("Error fetching organizer detail:", err);
    res.status(500).json({ error: "Failed to fetch organizer detail" });
  }
});

export default router;
