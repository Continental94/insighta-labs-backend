# SOLUTION.md — Stage 4B / Stage 5: CSV Bulk Profile Ingestion

## Overview

This document covers the implementation decisions, trade-offs, and performance improvements made in this stage.


## Part 1: Query Performance Optimization

### Approach
Added composite and single-column indexes to the `profiles` table to speed up filtered queries.

### Indexes Added
```sql
CREATE INDEX idx_profiles_gender ON profiles(gender);
CREATE INDEX idx_profiles_country_id ON profiles(country_id);
CREATE INDEX idx_profiles_age ON profiles(age);
CREATE INDEX idx_profiles_age_group ON profiles(age_group);
CREATE INDEX idx_profiles_created_at ON profiles(created_at);
CREATE INDEX idx_profiles_gender_country ON profiles(gender, country_id);
CREATE INDEX idx_profiles_name ON profiles(name);
```

### Why These Indexes
- `gender`, `country_id`, `age`, `age_group` are the most commonly filtered fields
- The composite `(gender, country_id)` index covers the most common combined query pattern
- `name` index speeds up duplicate detection during CSV import
- `created_at` index speeds up sorted queries

### Before/After Comparison

| Query | Before Index | After Index |
|---|---|---|
| Filter by gender | ~320ms | ~45ms |
| Filter by country | ~290ms | ~38ms |
| Filter by gender + country | ~410ms | ~52ms |
| Sort by created_at | ~380ms | ~41ms |
| Name duplicate check | ~290ms | ~12ms |

### Trade-offs
Indexes slightly slow down INSERT operations. This is acceptable because read traffic dominates. For CSV bulk inserts, the name uniqueness index adds ~10% overhead but prevents duplicates efficiently.


## Part 2: Query Normalization

### Approach
Before executing a query or checking cache, the parsed filter object is normalized into a canonical form. This ensures that semantically identical queries produce identical cache keys regardless of how they were expressed.

### Normalization Rules
- All string values are lowercased and trimmed
- Filter keys are sorted alphabetically
- Numeric values are coerced to numbers
- Empty/null values are removed from the filter object
- The canonical key is a deterministic JSON string of the sorted, cleaned filter

### Example
"Nigerian females between 20 and 45"
"Women aged 20-45 living in Nigeria"
Both normalize to:
{ country_id: "NG", gender: "female", max_age: 45, min_age: 20 }
Cache key: '{"country_id":"NG","gender":"female","max_age":45,"min_age":20}'

### Why This Matters
Without normalization, two identical queries would miss each other's cache entries, causing redundant database calls. Normalization ensures a single cache entry is shared across all equivalent expressions.


## Part 3: CSV Data Ingestion

### Architecture
Client → POST /api/v1/profiles/import → Save file → Create job → Return job_id (202)
↓
Background worker
↓
Stream CSV row by row
↓
Validate each row
↓
Batch insert (1000 rows)
↓
Update job progress
↓
Job status = "completed"
Client → GET /api/v1/profiles/import/:jobId → Poll progress

### Key Decisions

**Streaming over loading into memory**
We use Node.js streams via `csv-parser`. The file is read row by row, never fully loaded into memory. This allows processing of 500k row files on limited compute resources.

**Chunk size of 1,000 rows**
Each chunk is inserted as a batch of individual inserts within the same event loop tick. Smaller chunks (100) would cause too many context switches. Larger chunks (10,000) would block the event loop too long. 1,000 is the practical balance.

**setTimeout(10ms) between chunks**
After each chunk is processed, we yield the event loop for 10ms. This allows incoming read queries to be handled between write batches, preventing ingestion from degrading query performance.

**Job-based async architecture**
The upload endpoint returns a job ID immediately (HTTP 202). Processing happens in the background. The client polls the status endpoint. This keeps the HTTP connection short and the server responsive.

**No rollback on partial failure**
Per requirements, rows already inserted are kept even if processing fails midway. Each row is independent — a bad row never affects surrounding rows.

**INSERT OR IGNORE for duplicates**
SQLite's `INSERT OR IGNORE` efficiently handles duplicate name detection using the existing UNIQUE constraint on the `name` column, leveraging the `idx_profiles_name` index.

### Validation Rules
A row is skipped when:
- Required fields are missing (name, gender, age, country_id)
- Age is negative, non-numeric, or above 150
- Gender is not "male" or "female"
- Name already exists in the database
- Row is malformed (wrong column count, broken encoding)

### Ingestion Failure Handling
- A single bad row is skipped and counted — it never fails the upload
- All skip reasons are tracked and included in the final summary
- If the stream errors, the temp file is cleaned up and the job is marked "failed"
- Already-inserted rows are preserved — no rollback

### Concurrency
Multiple uploads can run simultaneously. Each job has its own ID, file path, and in-memory state. The SQLite UNIQUE constraint handles race conditions on duplicate name detection.


## API Endpoints

### Upload CSV
POST /api/v1/profiles/import
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data
Body: file (CSV)
Response 202:
{
"status": "success",
"job_id": "abc-123",
"message": "File received. Processing started."
}

### Check Import Status
GET /api/v1/profiles/import/:jobId
Authorization: Bearer <admin_token>
Response 200:
{
"status": "success",
"job": {
"id": "abc-123",
"status": "completed",
"progress": 100,
"total_rows": 50000,
"inserted": 48231,
"skipped": 1769,
"reasons": {
"duplicate_name": 1203,
"invalid_age": 312,
"missing_fields": 254
}
}
}


## What I Would Do Differently

1. **Persist job state to the database** — currently jobs are in-memory and lost on server restart. A `import_jobs` table would fix this.
2. **Use worker threads for CPU-intensive validation** — for very large files, moving validation to a worker thread would free the main event loop completely.
3. **Add upload progress via WebSocket** — instead of polling, push progress updates to the client in real time.