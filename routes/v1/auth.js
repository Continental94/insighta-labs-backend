const express = require("express");
const router = express.Router();
const axios = require("axios");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const db = require("../../database/db");
const authenticate = require("../../middleware/authenticate");

const pkceStore = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, github_id: user.github_id, username: user.username, role: user.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" }
  );
}

function saveRefreshToken(userId, token) {
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.run(
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
    [id, userId, token, expiresAt]
  );
}

// ─── STEP 1: Initiate OAuth login ─────────────────────────────────────────────

router.get("/github", (req, res) => {
  const source = req.query.source || "web";
  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  pkceStore.set(state, { codeVerifier, source });
  setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `https://insighta-labs-backend-production.up.railway.app/api/v1/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });

  res.json({
    status: "success",
    auth_url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    state,
    code_challenge: codeChallenge,
  });
});

// ─── STEP 2: GitHub callback ───────────────────────────────────────────────────

router.get("/github/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ status: "error", message: "Missing code or state" });
  }

  const pkceEntry = pkceStore.get(state);
  if (!pkceEntry) {
    return res.status(400).json({ status: "error", message: "Invalid or expired state" });
  }

  pkceStore.delete(state);
  const { source } = pkceEntry;

  try {
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `https://insighta-labs-backend-production.up.railway.app/api/v1/auth/github/callback`,
      },
      { headers: { Accept: "application/json" } }
    );

    const githubAccessToken = tokenResponse.data.access_token;
    if (!githubAccessToken) {
      return res.status(400).json({ status: "error", message: "GitHub token exchange failed" });
    }

    const userResponse = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${githubAccessToken}` },
    });

    const githubUser = userResponse.data;

    db.get(`SELECT * FROM users WHERE github_id = ?`, [String(githubUser.id)], (err, existingUser) => {
      if (err) return res.status(500).json({ status: "error", message: err.message });

      let user;

      const afterUpsert = (u) => {
        user = u;
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);
        saveRefreshToken(user.id, refreshToken);

        if (source === "cli") {
          return res.json({
            status: "success",
            access_token: accessToken,
            refresh_token: refreshToken,
            user: { id: user.id, username: user.username, role: user.role },
          });
        } else {
          res.cookie("access_token", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 15 * 60 * 1000,
          });
          res.cookie("refresh_token", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });

          const frontendUrl = process.env.FRONTEND_URL || "https://insighta-portal.vercel.app";
          return res.redirect(`${frontendUrl}/auth/success?role=${user.role}`);
        }
      };

      if (existingUser) {
        db.run(
          `UPDATE users SET username = ?, email = ?, avatar_url = ? WHERE github_id = ?`,
          [githubUser.login, githubUser.email, githubUser.avatar_url, String(githubUser.id)],
          () => afterUpsert(existingUser)
        );
      } else {
        const newUser = {
          id: uuidv4(),
          github_id: String(githubUser.id),
          username: githubUser.login,
          email: githubUser.email,
          avatar_url: githubUser.avatar_url,
          role: "analyst",
        };
        db.run(
          `INSERT INTO users (id, github_id, username, email, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)`,
          [newUser.id, newUser.github_id, newUser.username, newUser.email, newUser.avatar_url, newUser.role],
          () => afterUpsert(newUser)
        );
      }
    });
  } catch (err) {
    console.error("OAuth callback error:", err.message);
    res.status(500).json({ status: "error", message: "Authentication failed" });
  }
});

// ─── REFRESH TOKEN ─────────────────────────────────────────────────────────────

router.post("/refresh", (req, res) => {
  const token = req.body.refresh_token || (req.cookies && req.cookies.refresh_token);

  if (!token) {
    return res.status(401).json({ status: "error", message: "Refresh token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    db.get(
      `SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ?`,
      [token, decoded.id],
      (err, row) => {
        if (err || !row) {
          return res.status(401).json({ status: "error", message: "Invalid refresh token" });
        }

        if (new Date(row.expires_at) < new Date()) {
          return res.status(401).json({ status: "error", message: "Refresh token expired" });
        }

        db.get(`SELECT * FROM users WHERE id = ?`, [decoded.id], (err, user) => {
          if (err || !user) {
            return res.status(401).json({ status: "error", message: "User not found" });
          }

          const newAccessToken = generateAccessToken(user);

          if (req.cookies && req.cookies.refresh_token) {
            res.cookie("access_token", newAccessToken, {
              httpOnly: true,
              secure: true,
              sameSite: "none",
              maxAge: 15 * 60 * 1000,
            });
            return res.json({ status: "success", message: "Token refreshed" });
          } else {
            return res.json({ status: "success", access_token: newAccessToken });
          }
        });
      }
    );
  } catch (err) {
    return res.status(401).json({ status: "error", message: "Invalid refresh token" });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

router.post("/logout", authenticate, (req, res) => {
  const token = req.body.refresh_token || (req.cookies && req.cookies.refresh_token);

  if (token) {
    db.run(`DELETE FROM refresh_tokens WHERE token = ?`, [token]);
  }

  res.clearCookie("access_token", { sameSite: "none", secure: true });
  res.clearCookie("refresh_token", { sameSite: "none", secure: true });
  res.clearCookie("csrf_token");

  res.json({ status: "success", message: "Logged out successfully" });
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────

router.get("/me", authenticate, (req, res) => {
  db.get(`SELECT id, username, email, avatar_url, role, created_at FROM users WHERE id = ?`,
    [req.user.id],
    (err, user) => {
      if (err || !user) {
        return res.status(404).json({ status: "error", message: "User not found" });
      }
      res.json({ status: "success", data: user });
    }
  );
});

module.exports = router;