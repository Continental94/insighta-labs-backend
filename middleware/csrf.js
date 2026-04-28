const crypto = require("crypto");

const generateCsrfToken = (req, res, next) => {
  if (!req.cookies.csrf_token) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 24 * 60 * 60 * 1000,
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies.csrf_token;
  }
  next();
};

const validateCsrfToken = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return next();
  }
  // Skip CSRF for auth routes
  if (req.path.startsWith("/auth") || req.path.startsWith("/api/auth") || req.path.startsWith("/api/v1/auth")) {
    return next();
  }
  const cookieToken = req.cookies.csrf_token;
  const headerToken = req.headers["x-csrf-token"];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      status: "error",
      message: "Invalid CSRF token",
    });
  }
  next();
};

module.exports = { generateCsrfToken, validateCsrfToken };