import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middlewares/error";
import authRoutes from "./routes/auth";
import eventRoutes from "./routes/events";
import promoRoutes from "./routes/promotions";
import txRoutes from "./routes/transactions";
import reviewRoutes from "./routes/reviews";
import path from "path";

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

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/promotions", promoRoutes);
app.use("/api/transactions", txRoutes);
app.use("/api/reviews", reviewRoutes);

app.use(errorHandler);

export default app;
