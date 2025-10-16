import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../libs/prisma";
import { signToken } from "../libs/jwt";
import { validateSchema } from "../middlewares/validate";
import { requireAuth, requireRole } from "../middlewares/auth";
import {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  updateOrganizerSchema,
} from "../schemas/auth.schema";

const router = Router();

/**
 * POST /api/auth/register
 * Registrasi pengguna baru
 */
router.post("/register", validateSchema(registerSchema), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      return res.status(400).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hash,
        role,
        ...(role === "ORGANIZER"
          ? { organizer: { create: { displayName: name, bio: "" } } }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const token = signToken({ id: user.id, role: user.role });

    res.status(201).json({
      message: "User registered successfully",
      data: { ...user, token },
    });
  } catch (err) {
    console.error("Error in register:", err);
    res.status(500).json({ error: "Failed to register user" });
  }
});

/**
 * POST /api/auth/login
 * Login pengguna
 */
router.post("/login", validateSchema(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: user.id, role: user.role });

    res.json({
      message: "Login successful",
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        token,
      },
    });
  } catch (err) {
    console.error("Error in login:", err);
    res.status(500).json({ error: "Failed to login" });
  }
});

/**
 * GET /api/auth/me
 * Mendapatkan profil pengguna yang sedang login
 */
router.get("/me", requireAuth, async (req, res) => {
  try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          pointsBalance: true,
          organizer: {
            select: {
              displayName: true,
              bio: true,
              ratingsAvg: true,
            },
          },
        },
      });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ data: user });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

/**
 * PUT /api/auth/profile
 * Update profil pengguna umum
 */
router.put(
  "/profile",
  requireAuth,
  validateSchema(updateProfileSchema),
  async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const data: any = {};

      if (name) data.name = name;
      if (email) data.email = email;
      if (password) data.passwordHash = await bcrypt.hash(password, 10);

      const updated = await prisma.user.update({
        where: { id: req.user!.id },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          pointsBalance: true,
        },
      });

      res.json({
        message: "Profile updated successfully",
        data: updated,
      });
    } catch (err) {
      console.error("Error updating profile:", err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  }
);

/**
 * PUT /api/auth/organizer
 * Update profil organizer (khusus role ORGANIZER)
 */
router.put(
  "/organizer",
  requireAuth,
  requireRole("ORGANIZER"),
  validateSchema(updateOrganizerSchema),
  async (req, res) => {
    try {
      const { displayName, bio } = req.body;

      const organizer = await prisma.organizerProfile.findUnique({
        where: { userId: req.user!.id },
      });

      if (!organizer)
        return res.status(404).json({ error: "Organizer profile not found" });

      const updated = await prisma.organizerProfile.update({
        where: { id: organizer.id },
        data: { displayName, bio },
        select: { id: true, displayName: true, bio: true },
      });

      res.json({
        message: "Organizer profile updated successfully",
        data: updated,
      });
    } catch (err) {
      console.error("Error updating organizer profile:", err);
      res.status(500).json({ error: "Failed to update organizer profile" });
    }
  }
);

export default router;
