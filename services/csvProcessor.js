const fs = require("fs");
const csv = require("csv-parser");
const { v4: uuidv4 } = require("uuid");
const { updateJob } = require("./importJob");

const CHUNK_SIZE = 1000;
const VALID_GENDERS = ["male", "female"];
const REQUIRED_FIELDS = ["name", "gender", "age", "country_id"];

// ── Validate a single row ──────────────────────────────────────────────────────
const validateRow = (row) => {
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (!row[field] || String(row[field]).trim() === "") {
      return { valid: false, reason: "missing_fields" };
    }
  }

  // Validate gender
  const gender = String(row.gender).toLowerCase().trim();
  if (!VALID_GENDERS.includes(gender)) {
    return { valid: false, reason: "invalid_gender" };
  }

  // Validate age
  const age = Number(row.age);
  if (isNaN(age) || age < 0 || age > 150) {
    return { valid: false, reason: "invalid_age" };
  }

  return { valid: true };
};

// ── Determine age group ────────────────────────────────────────────────────────
const getAgeGroup = (age) => {
  if (age < 13) return "child";
  if (age < 18) return "teenager";
  if (age < 65) return "adult";
  return "senior";
};

// ── Insert a chunk of rows into the database ───────────────────────────────────
const insertChunk = (db, chunk) => {
  return new Promise((resolve) => {
    if (chunk.length === 0) return resolve({ inserted: 0, skipped: 0, reasons: {} });

    let inserted = 0;
    let skipped = 0;
    const reasons = { duplicate_name: 0 };
    let completed = 0;

    chunk.forEach((row) => {
      const id = uuidv4();
      const gender = String(row.gender).toLowerCase().trim();
      const age = Number(row.age);
      const ageGroup = getAgeGroup(age);
      const name = String(row.name).trim();
      const countryId = String(row.country_id).trim();
      const countryName = row.country_name ? String(row.country_name).trim() : "";
      const createdAt = new Date().toISOString();

      db.run(
        `INSERT OR IGNORE INTO profiles 
         (id, name, gender, age, age_group, country_id, country_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, gender, age, ageGroup, countryId, countryName, createdAt],
        function (err) {
          if (err) {
            skipped++;
            reasons.duplicate_name = (reasons.duplicate_name || 0) + 1;
          } else if (this.changes === 0) {
            skipped++;
            reasons.duplicate_name = (reasons.duplicate_name || 0) + 1;
          } else {
            inserted++;
          }

          completed++;
          if (completed === chunk.length) {
            resolve({ inserted, skipped, reasons });
          }
        }
      );
    });
  });
};

// ── Main processor ────────────────────────────────────────────────────────────
const processCSV = (db, jobId, filePath) => {
  updateJob(jobId, { status: "processing" });

  let chunk = [];
  let totalRows = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let streamEnded = false;
  const allReasons = {
    duplicate_name: 0,
    invalid_age: 0,
    invalid_gender: 0,
    missing_fields: 0,
    malformed_row: 0,
  };

  const stream = fs.createReadStream(filePath).pipe(csv());

  stream.on("data", async (row) => {
    stream.pause();
    totalRows++;

    // Validate row
    const validation = validateRow(row);
    if (!validation.valid) {
      totalSkipped++;
      allReasons[validation.reason] = (allReasons[validation.reason] || 0) + 1;
      stream.resume();
      return;
    }

    chunk.push(row);

    // Process chunk when full
    if (chunk.length >= CHUNK_SIZE) {
      const currentChunk = [...chunk];
      chunk = [];

      const result = await insertChunk(db, currentChunk);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      // Merge reasons
      for (const [key, val] of Object.entries(result.reasons)) {
        allReasons[key] = (allReasons[key] || 0) + val;
      }

      // Update job progress
      updateJob(jobId, {
        total_rows: totalRows,
        inserted: totalInserted,
        skipped: totalSkipped,
        reasons: { ...allReasons },
        progress: Math.min(99, Math.round((totalInserted + totalSkipped) / Math.max(totalRows, 1) * 100)),
      });

      // Yield event loop so reads can continue
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    stream.resume();
  });

  stream.on("end", async () => {
    streamEnded = true;

    // Process remaining chunk
    if (chunk.length > 0) {
      const result = await insertChunk(db, chunk);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      for (const [key, val] of Object.entries(result.reasons)) {
        allReasons[key] = (allReasons[key] || 0) + val;
      }
    }

    // Clean up temp file
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

    // Mark job complete
    updateJob(jobId, {
      status: "completed",
      progress: 100,
      total_rows: totalRows,
      inserted: totalInserted,
      skipped: totalSkipped,
      reasons: { ...allReasons },
    });
  });

  stream.on("error", (err) => {
    try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
    updateJob(jobId, {
      status: "failed",
      error: err.message,
    });
  });
};

module.exports = { processCSV };