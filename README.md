# Insighta Labs+ — Backend API

## System Architecture

```
insighta-labs-backend/
├── server.js                  # Entry point, middleware wiring
├── database/db.js             # SQLite (profiles, users, tokens, logs)
├── middleware/
│   ├── authenticate.js        # JWT verification (Bearer + cookie)
│   ├── authorize.js           # Role-based access control
│   ├── csrf.js                # CSRF token generation + validation
│   ├── rateLimiter.js         # 100 req / 15 min per IP
│   └── requestLogger.js       # Logs every request to DB
├── routes/v1/
│   ├── auth.js                # GitHub OAuth + token management
│   ├── profiles.js            # Profile search, filter, export
│   └── users.js               # User management (admin only)
├── services/seed.js           # Seeds profiles from JSON
└── .env                       # Secrets (never committed to git)
```

## Authentication Flow

1. Client calls `GET /api/v1/auth/github?source=cli` (or `source=web`)
2. Server returns a GitHub authorization URL with a state param (PKCE stored server-side)
3. User visits the URL and approves on GitHub
4. GitHub redirects to `/api/v1/auth/github/callback`
5. Server exchanges code, fetches GitHub profile, upserts user in DB
6. **CLI:** returns `access_token` + `refresh_token` as JSON
7. **Web:** sets HTTP-only cookies, redirects to frontend

## Token Handling

- Access tokens: JWT, expire in **15 minutes**
- Refresh tokens: JWT, expire in **7 days**, stored in database
- Refresh: `POST /api/v1/auth/refresh` with `{ refresh_token }` (CLI) or via cookie (web)
- Logout: `POST /api/v1/auth/logout` — deletes token from DB, clears cookies

## Role Enforcement

| Route | Admin | Analyst |
|---|---|---|
| GET /api/v1/profiles | ✅ | ✅ |
| GET /api/v1/profiles/search | ✅ | ✅ |
| GET /api/v1/profiles/export | ✅ | ✅ |
| GET /api/v1/users | ✅ | ❌ |
| PATCH /api/v1/users/:id/role | ✅ | ❌ |
| GET /api/v1/users/logs | ✅ | ❌ |

New users default to `analyst`. Admins can promote via `PATCH /api/v1/users/:id/role`.

## Pagination Shape (v1)

```json
{
  "status": "success",
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 500,
    "total_pages": 50,
    "has_next": true,
    "has_prev": false
  },
  "data": []
}
```

## Natural Language Parsing

`GET /api/v1/profiles/search?q=young+females+in+Nigeria`
Parses free text into DB filters. Supports gender, age group, age ranges (above/below X), and country names.

## Rate Limiting

100 requests per 15 minutes per IP. Returns `429` when exceeded.

## Local Setup

```bash
npm install
# Add .env file with required variables
npm run dev
```

## Environment Variables

```
PORT=3000
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d
FRONTEND_URL=http://localhost:5173
```
