const express = require("express");
const router = express.Router();
const db = require("../../database/db");
const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");

// ─── GET ALL USERS (admin only) ───────────────────────────────────────────────

router.get("/", authenticate, authorize("admin"), (req, res) => {
  db.all(
    `SELECT id, username, email, avatar_url, role, created_at FROM users ORDER BY created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ status: "error", message: err.message });
      res.json({ status: "success", total: rows.length, data: rows });
    }
  );
});

// ─── UPDATE USER ROLE (admin only) ────────────────────────────────────────────

router.patch("/:id/role", authenticate, authorize("admin"), (req, res) => {
  const { role } = req.body;

  if (!["admin", "analyst"].includes(role)) {
    return res.status(400).json({
      status: "error",
      message: "Role must be 'admin' or 'analyst'",
    });
  }

  // Prevent admin from demoting themselves
  if (req.params.id === req.user.id && role !== "admin") {
    return res.status(400).json({
      status: "error",
      message: "You cannot change your own role",
    });
  }

  db.run(
    `UPDATE users SET role = ? WHERE id = ?`,
    [role, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ status: "error", message: err.message });
      if (this.changes === 0) {
        return res.status(404).json({ status: "error", message: "User not found" });
      }
      res.json({ status: "success", message: `Role updated to '${role}'` });
    }
  );
});

// ─── GET REQUEST LOGS (admin only) ────────────────────────────────────────────

router.get("/logs", authenticate, authorize("admin"), (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const offset = (page - 1) * limit;

  db.all(
    `SELECT * FROM request_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset],
    (err, rows) => {
      if (err) return res.status(500).json({ status: "error", message: err.message });
      res.json({ status: "success", page, limit, data: rows });
    }
  );
});

module.exports = router;
