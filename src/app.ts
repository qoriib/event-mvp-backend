import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middlewares/error";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import promoRoutes from "./routes/promotions";
import txRoutes from "./routes/transactions";
import reviewRoutes from "./routes/reviews";

const app = express();

const allowedOrigins = ["http://localhost:3000"];

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "5mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/promotions", promoRoutes);
app.use("/api/transactions", txRoutes);
app.use("/api/reviews", reviewRoutes);

// Global error handler (harus di bawah semua route)
app.use(errorHandler);

export default app;
