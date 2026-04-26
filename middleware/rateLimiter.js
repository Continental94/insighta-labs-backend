// Simple in-memory rate limiter
// 100 requests per 15 minutes per IP
const requests = new Map();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 100;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!requests.has(ip)) {
    requests.set(ip, { count: 1, startTime: now });
    return next();
  }

  const record = requests.get(ip);

  // Reset window if expired
  if (now - record.startTime > WINDOW_MS) {
    requests.set(ip, { count: 1, startTime: now });
    return next();
  }

  // Too many requests
  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({
      status: "error",
      message: "Too many requests. Please try again in 15 minutes.",
    });
  }

  record.count += 1;
  next();
};

module.exports = rateLimiter;
