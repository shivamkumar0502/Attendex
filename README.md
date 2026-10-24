# Attendex

Responsive attendance management built with **React + Vite**, **Node.js + Express**, and **MongoDB**.

## Start locally

Use Node.js 22+ and MongoDB 7+ (local MongoDB or an Atlas connection string).

```sh
npm ci
cp .env.example .env
# Edit .env and set MONGODB_URI.
npm run dev
```

React runs at http://localhost:5173; Vite proxies `/api` to Express on port 8000. Keep the browser on port 5173 during development. Never put MongoDB credentials in frontend files or VITE_ variables.

For MongoDB Atlas, use its database connection string as `MONGODB_URI`, create a database user, and allow the backend host in the Atlas network access list. `MONGODB_DB` defaults to `attendex`. The server connects and creates indexes before accepting requests, and exits with an error if the database is unavailable.

## Build and serve

```sh
npm run build
npm start
```

Express serves `frontend/dist` and `/api` from one origin, so no separate frontend API configuration is needed. Set `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example`, and `COOKIE_SECURE=1` behind HTTPS. Set `TRUST_PROXY=1` only when behind one trusted reverse proxy. Use `npm ci` (including dev dependencies) during the build stage; Vite is a build dependency.

## Features

- Teacher and student signup/login, salted scrypt passwords and hashed server-side session tokens.
- MongoDB-backed sessions with expiration and TTL cleanup; HttpOnly, SameSite cookies.
- Class creation, unique join codes and idempotent student enrollment.
- One active attendance session per class, enforced by a database unique index.
- Student check-ins remain pending until the owning teacher confirms attendance.
- Teacher status editing, session closing, attendance history and CSV export.
- Responsive green/lime landing page and React dashboards with mobile/tablet breakpoints.
- Voice-assisted roll-call: browser speech synthesis reads names, speech recognition captures responses, and the teacher explicitly confirms each record. Speech support and microphone permissions depend on the browser; manual attendance always remains available.

Voice capture is **transcription, not biometric speaker verification**. The browser's speech service may process audio remotely. No voiceprints or raw recordings are stored. Face recognition and biometric enrollment are not included. The landing-page workspace is an explicitly labeled preview; accounts start with empty classrooms.

## Structure

- `frontend/src/main.jsx`: React application, authentication, classroom and record components.
- `frontend/src/VoiceRollCall.jsx`: microphone and speech lifecycle with cleanup on navigation.
- `frontend/src/api.js`: API requests and CSV export.
- `backend/src/app.js`: Express API and authorization.
- `backend/src/db.js`: MongoDB connection pool and indexes.
- `backend/src/server.js`: configuration, startup and graceful shutdown.

This replaces the earlier Python/SQLite implementation. SQLite records are not automatically imported. Existing Python login sessions do not carry over.

## Verification

```sh
npm run build
npm test
```

The integration suite starts an ephemeral **real MongoDB** using mongodb-memory-server. Its initial run requires a MongoDB binary download and an environment that permits running mongod. Tests cover teacher/student workflows, persistence across logins, restricted routes, duplicate check-ins, session closure, input validation and cross-origin rejection. CI runs these checks on Ubuntu. For restricted environments, `npm run test:unit` runs API validation/security tests without mongod.

## Deployment scope

MongoDB holds application data, so application filesystem persistence is unnecessary. Multiple API processes can share database-backed sessions and connection pools. Rate limits currently use per-process memory; use a shared rate-limit store before horizontal scaling. Teacher signup is self-service: institution invitations/approval, organization isolation, password recovery, email verification, audit logs, retention controls and backups remain necessary before a school-wide production rollout. State responses currently load all of a user's class history; add pagination for large historical datasets.
