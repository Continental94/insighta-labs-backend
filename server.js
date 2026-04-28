require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const db = require("./database/db");
const seedDatabase = require("./services/seed");

const rateLimiter = require("./middleware/rateLimiter");
const requestLogger = require("./middleware/requestLogger");
const { generateCsrfToken, validateCsrfToken } = require("./middleware/csrf");

const authRoutes = require("./routes/v1/auth");
const profileRoutes = require("./routes/v1/profiles");
const userRoutes = require("./routes/v1/users");

const app = express();

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:3001",
    "https://insighta-portal.vercel.app",
    "https://insighta-portal-e8l3evwle-infinity-quotients-projects.vercel.app",
    "https://insighta-portal-7g8lblfek-infinity-quotients-projects.vercel.app",
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));

// ── Body & Cookie Parsing ──────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Global Middleware ──────────────────────────────────────────────────────────
app.use(rateLimiter);
app.use(requestLogger);
app.use(generateCsrfToken);
app.use(validateCsrfToken);

// ── Seed database ──────────────────────────────────────────────────────────────
seedDatabase();

// ── Root ───────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "Insighta Labs+ API",
    version: "v1",
    status: "live",
  });
});

// ── v1 Routes ──────────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profiles", profileRoutes);
app.use("/api/v1/users", userRoutes);

// ── Aliases without version prefix ────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/users", userRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

// ── Global Error Handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

// ── Start Server ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Insighta Labs+ running on port ${PORT}`);
});