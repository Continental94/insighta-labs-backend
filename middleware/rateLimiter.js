const requests = new Map();

const AUTH_WINDOW_MS = 60 * 1000; // 1 minute
const AUTH_MAX_REQUESTS = 10; // 10 requests per minute

const GENERAL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const GENERAL_MAX_REQUESTS = 100;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  // Stricter limit for auth routes
  const isAuthRoute = req.path.includes("/auth/github");
  const windowMs = isAuthRoute ? AUTH_WINDOW_MS : GENERAL_WINDOW_MS;
  const maxRequests = isAuthRoute ? AUTH_MAX_REQUESTS : GENERAL_MAX_REQUESTS;
  const key = isAuthRoute ? `auth:${ip}` : `general:${ip}:${req.path}`;

  if (!requests.has(key)) {
    requests.set(key, { count: 1, startTime: now });
    return next();
  }

  const record = requests.get(key);

  if (now - record.startTime > windowMs) {
    requests.set(key, { count: 1, startTime: now });
    return next();
  }

  if (record.count >= maxRequests) {
    return res.status(429).json({
      status: "error",
      message: "Too many requests. Please try again later.",
      retry_after: Math.ceil((record.startTime + windowMs - now) / 1000),
    });
  }

  record.count += 1;
  next();
};

module.exports = rateLimiter;