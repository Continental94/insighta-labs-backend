const crypto = require("crypto");

// Generate a CSRF token and store in cookie
const generateCsrfToken = (req, res, next) => {
  if (!req.cookies.csrf_token) {
    const token = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf_token", token, {
      httpOnly: false, // Must be readable by JS to send in header
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    req.csrfToken = token;
  } else {
    req.csrfToken = req.cookies.csrf_token;
  }
  next();
};

// Validate CSRF token on state-changing requests
const validateCsrfToken = (req, res, next) => {
  // Only validate for state-changing methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // CLI clients using Bearer tokens skip CSRF check
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
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
