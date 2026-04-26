const express = require("express");
const router = express.Router();
const db = require("../../database/db");
const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");

// ─── GET ALL PROFILES (filter + sort + pagination) ────────────────────────────
// Both admin and analyst can access

router.get("/", authenticate, authorize("admin", "analyst"), (req, res) => {
  const {
    gender,
    country_id,
    age_group,
    min_age,
    max_age,
    min_gender_probability,
    min_country_probability,
    sort_by = "created_at",
    order = "asc",
    page = 1,
    limit = 10,
  } = req.query;

  let query = "SELECT * FROM profiles WHERE 1=1";
  let countQuery = "SELECT COUNT(*) as total FROM profiles WHERE 1=1";
  let params = [];
  let countParams = [];

  // ── Filters ────────────────────────────────────────────────────────────
  if (gender) {
    query += " AND LOWER(gender) = LOWER(?)";
    countQuery += " AND LOWER(gender) = LOWER(?)";
    params.push(gender);
    countParams.push(gender);
  }

  if (country_id) {
    query += " AND LOWER(country_id) = LOWER(?)";
    countQuery += " AND LOWER(country_id) = LOWER(?)";
    params.push(country_id);
    countParams.push(country_id);
  }

  if (age_group) {
    query += " AND LOWER(age_group) = LOWER(?)";
    countQuery += " AND LOWER(age_group) = LOWER(?)";
    params.push(age_group);
    countParams.push(age_group);
  }

  if (min_age) {
    query += " AND age >= ?";
    countQuery += " AND age >= ?";
    params.push(Number(min_age));
    countParams.push(Number(min_age));
  }

  if (max_age) {
    query += " AND age <= ?";
    countQuery += " AND age <= ?";
    params.push(Number(max_age));
    countParams.push(Number(max_age));
  }

  if (min_gender_probability) {
    query += " AND gender_probability >= ?";
    countQuery += " AND gender_probability >= ?";
    params.push(Number(min_gender_probability));
    countParams.push(Number(min_gender_probability));
  }

  if (min_country_probability) {
    query += " AND country_probability >= ?";
    countQuery += " AND country_probability >= ?";
    params.push(Number(min_country_probability));
    countParams.push(Number(min_country_probability));
  }

  // ── Sorting ────────────────────────────────────────────────────────────
  const validSortFields = ["age", "created_at", "gender_probability"];
  const validOrder = ["asc", "desc"];

  if (!validSortFields.includes(sort_by) || !validOrder.includes(order)) {
    return res.status(400).json({
      status: "error",
      message: "Invalid sort_by or order parameter",
    });
  }

  query += ` ORDER BY ${sort_by} ${order.toUpperCase()}`;

  // ── Pagination ─────────────────────────────────────────────────────────
  const pageNum = Math.max(1, Number(page));
  const limitNum = Math.min(Math.max(1, Number(limit)), 50);
  const offset = (pageNum - 1) * limitNum;

  query += " LIMIT ? OFFSET ?";
  params.push(limitNum, offset);

  // ── Execute ────────────────────────────────────────────────────────────
  db.get(countQuery, countParams, (err, countRow) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ status: "error", message: err.message });

      const total = countRow.total;
      const totalPages = Math.ceil(total / limitNum);

      res.status(200).json({
        status: "success",
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          total_pages: totalPages,
          has_next: pageNum < totalPages,
          has_prev: pageNum > 1,
        },
        data: rows,
      });
    });
  });
});

// ─── NATURAL LANGUAGE SEARCH ──────────────────────────────────────────────────

router.get("/search", authenticate, authorize("admin", "analyst"), (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.status(400).json({ status: "error", message: "Missing query parameter 'q'" });
  }

  const queryText = q.toLowerCase();
  let filters = {};

  // Gender
  if (queryText.includes("female")) filters.gender = "female";
  else if (queryText.includes("male")) filters.gender = "male";

  // Age group
  if (queryText.includes("child")) filters.age_group = "child";
  else if (queryText.includes("teen")) filters.age_group = "teenager";
  else if (queryText.includes("adult")) filters.age_group = "adult";
  else if (queryText.includes("senior")) filters.age_group = "senior";

  // Young
  if (queryText.includes("young")) {
    filters.min_age = 16;
    filters.max_age = 24;
  }

  // Above X age
  const aboveMatch = queryText.match(/above (\d+)/);
  if (aboveMatch) filters.min_age = Number(aboveMatch[1]);

  // Below X age
  const belowMatch = queryText.match(/below (\d+)/);
  if (belowMatch) filters.max_age = Number(belowMatch[1]);

  // Countries
  const countryMap = {
    nigeria: "NG", kenya: "KE", angola: "AO", ghana: "GH",
    uganda: "UG", tanzania: "TZ", benin: "BJ", ethiopia: "ET",
    cameroon: "CM", senegal: "SN", "south africa": "ZA", egypt: "EG",
  };

  for (const [name, code] of Object.entries(countryMap)) {
    if (queryText.includes(name)) {
      filters.country_id = code;
      break;
    }
  }

  if (Object.keys(filters).length === 0) {
    return res.status(400).json({
      status: "error",
      message: "Unable to interpret query. Try something like: 'young females in Nigeria'",
    });
  }

  let sql = "SELECT * FROM profiles WHERE 1=1";
  let countSql = "SELECT COUNT(*) as total FROM profiles WHERE 1=1";
  let params = [];
  let countParams = [];

  const addFilter = (clause, value) => {
    sql += clause;
    countSql += clause;
    params.push(value);
    countParams.push(value);
  };

  if (filters.gender) addFilter(" AND gender = ?", filters.gender);
  if (filters.age_group) addFilter(" AND age_group = ?", filters.age_group);
  if (filters.country_id) addFilter(" AND country_id = ?", filters.country_id);
  if (filters.min_age) addFilter(" AND age >= ?", filters.min_age);
  if (filters.max_age) addFilter(" AND age <= ?", filters.max_age);

  // Pagination
  const pageNum = Math.max(1, Number(req.query.page || 1));
  const limitNum = Math.min(Math.max(1, Number(req.query.limit || 10)), 50);
  const offset = (pageNum - 1) * limitNum;

  sql += " LIMIT ? OFFSET ?";
  params.push(limitNum, offset);

  db.get(countSql, countParams, (err, countRow) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ status: "error", message: err.message });

      const total = countRow.total;
      const totalPages = Math.ceil(total / limitNum);

      res.json({
        status: "success",
        query: q,
        filters_applied: filters,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          total_pages: totalPages,
          has_next: pageNum < totalPages,
          has_prev: pageNum > 1,
        },
        data: rows,
      });
    });
  });
});

// ─── CSV EXPORT ────────────────────────────────────────────────────────────────
// Admin and analyst can export

router.get("/export", authenticate, authorize("admin", "analyst"), (req, res) => {
  const { gender, country_id, age_group } = req.query;

  let query = "SELECT * FROM profiles WHERE 1=1";
  let params = [];

  if (gender) { query += " AND LOWER(gender) = LOWER(?)"; params.push(gender); }
  if (country_id) { query += " AND LOWER(country_id) = LOWER(?)"; params.push(country_id); }
  if (age_group) { query += " AND LOWER(age_group) = LOWER(?)"; params.push(age_group); }

  query += " LIMIT 10000"; // Safety cap

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });

    if (rows.length === 0) {
      return res.status(404).json({ status: "error", message: "No profiles found for export" });
    }

    // Build CSV
    const headers = Object.keys(rows[0]).join(",");
    const csvRows = rows.map((row) =>
      Object.values(row)
        .map((v) => (v === null ? "" : `"${String(v).replace(/"/g, '""')}"`))
        .join(",")
    );

    const csv = [headers, ...csvRows].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="profiles_export_${Date.now()}.csv"`);
    res.send(csv);
  });
});

// ─── GET SINGLE PROFILE ───────────────────────────────────────────────────────

router.get("/:id", authenticate, authorize("admin", "analyst"), (req, res) => {
  db.get(`SELECT * FROM profiles WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ status: "error", message: err.message });
    if (!row) return res.status(404).json({ status: "error", message: "Profile not found" });
    res.json({ status: "success", data: row });
  });
});

module.exports = router;
