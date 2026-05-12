const { v4: uuidv4 } = require("uuid");

// In-memory job store
const jobs = new Map();

const createJob = (filename) => {
  const id = uuidv4();
  const job = {
    id,
    filename,
    status: "queued",
    progress: 0,
    total_rows: 0,
    inserted: 0,
    skipped: 0,
    reasons: {
      duplicate_name: 0,
      invalid_age: 0,
      invalid_gender: 0,
      missing_fields: 0,
      malformed_row: 0,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  jobs.set(id, job);
  return job;
};

const getJob = (id) => {
  return jobs.get(id) || null;
};

const updateJob = (id, updates) => {
  const job = jobs.get(id);
  if (!job) return null;
  const updated = {
    ...job,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  jobs.set(id, updated);
  return updated;
};

module.exports = { createJob, getJob, updateJob };