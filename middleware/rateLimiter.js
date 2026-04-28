const requests = new Map();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // 10 requests per minute per IP per path

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();
  const key = `${ip}:${req.path}`;

  if (!requests.has(key)) {
    requests.set(key, { count: 1, startTime: now });
    return next();
  }

  const record = requests.get(key);

  // Reset window if expired
  if (now - record.startTime > WINDOW_MS) {
    requests.set(key, { count: 1, startTime: now });
    return next();
  }

  // Too many requests
  if (record.count >= MAX_REQUESTS) {
    return res.status(429).json({
      status: "error",
      message: "Too many requests. Please try again later.",
      retry_after: Math.ceil((record.startTime + WINDOW_MS - now) / 1000),
    });
  }

  record.count += 1;
  next();
};

module.exports = rateLimiter;