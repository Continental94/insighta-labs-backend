require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const db = require("./database/db");
const seedDatabase = require("./services/seed");

const rateLimiter = require("./middleware/rateLimiter");
const requestLogger = require("./middleware/requestLogger");
const { generateCsrfToken, validateCsrfToken } = require("./middleware/csrf");
const authenticate = require("./middleware/authenticate");

const authRoutes = require("./routes/v1/auth");
const profileRoutes = require("./routes/v1/profiles");
const userRoutes = require("./routes/v1/users");

const app = express();

// ── CORS ───────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "https://insighta-portal.vercel.app",
  "https://insighta-portal-e8l3evwle-infinity-quotients-projects.vercel.app",
  "https://insighta-portal-7g8lblfek-infinity-quotients-projects.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token,X-API-Version");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ── Body & Cookie Parsing ──────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// ── Global Middleware ──────────────────────────────────────────────────────────
app.use(rateLimiter);
app.use(requestLogger);
app.use(generateCsrfToken);
app.use(validateCsrfToken);

// ── API Version Check ──────────────────────────────────────────────────────────
app.use("/api/v1", (req, res, next) => {
  const version = req.headers["x-api-version"];
  if (version && version !== "1" && version !== "v1" && version !== "1.0") {
    return res.status(400).json({
      status: "error",
      message: "Unsupported API version. Use X-API-Version: 1",
    });
  }
  next();
});

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

// ── /api/users/me alias ───────────────────────────────────────────────────────
app.get("/api/users/me", authenticate, (req, res) => {
  db.get(
    `SELECT id, username, email, avatar_url, role, created_at FROM users WHERE id = ?`,
    [req.user.id],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ status: "error", message: "User not found" });
      }
      res.json({ status: "success", data: user });
    }
  );
});

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