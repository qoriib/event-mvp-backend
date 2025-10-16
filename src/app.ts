import express from "express";
import cors from "cors";
import { errorHandler } from "./middlewares/error";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import promoRoutes from "./routes/promotions";
import txRoutes from "./routes/transactions";
import reviewRoutes from "./routes/reviews";

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/promotions", promoRoutes);
app.use("/api/transactions", txRoutes);
app.use("/api/reviews", reviewRoutes);

// Global error handler (harus di bawah semua route)
app.use(errorHandler);

export default app;
