# Attendex

**A classroom attendance workspace built with React, Express and MongoDB.**

[Live app](https://attendex-y32a.onrender.com) · [Product case study](docs/CASE_STUDY.md) · [Model sources](docs/MODELS.md)

**Release status: hardened pilot; full institutional production activation remains blocked.** See [production status and required acceptance](docs/PRODUCTION.md) and [recovery operations](docs/operations/RECOVERY.md). This release adds email/recovery, teacher approval, Mongo-backed rate limits, audit activity and an optional AWS liveness/group-photo review integration; provider activation and real-world acceptance have not been completed.

## Product experience

- A complete responsive product landing page with an interactive recruiter demo; the demo uses labeled sample data, requires no account and never writes to the API.
- Teacher/student authentication, class creation, QR invitation links and authenticated student enrollment.
- Live sessions, student check-ins, teacher-reviewed attendance, CSV export, searchable student directory and classroom insights. Missing records stay unmarked.
- Student camera/microphone onboarding, local photo capture, audio recording/playback and teacher classroom photos.
- Optional **experimental 1:1 face and voice comparison**: opt-in enrollment of 2–3 samples, fresh-sample comparison against the student's own account, AES-256-GCM encrypted templates and self-service deletion. Browser-derived comparison signals can accompany a student check-in for teacher review.

## Run locally

Node.js 22+, MongoDB 7+ (local MongoDB or Atlas), and internet access for the first model asset download.

```sh
npm ci
npm run prepare:models
cp .env.example .env
# Set MONGODB_URI in .env. For experimental comparisons, set BIOMETRIC_KEY.
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Express on port 8000. To generate a biometric encryption key locally:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put that value in `BIOMETRIC_KEY` in your private `.env` or hosting secret settings, never in source control or frontend variables. Keep the key stable and backed up securely: changing or losing it makes saved templates unreadable. Without a valid key, enrollment and comparison are disabled; manual attendance remains available.

For Atlas, configure a database user and network access for your backend host. Never put MongoDB credentials into a `VITE_` variable. `MONGODB_DB` defaults to `attendex`.

## Build and deploy

```sh
npm run build
npm start
```

The build copies face and WASM runtime assets and downloads a pinned, SHA-256-verified voice model. Generated model assets are excluded from Git. Express serves React and the API from a single origin. Voice weights are about 84 MB and loaded only when a user invokes voice comparison. Inference runs on the user's browser, not the Render CPU.

Production settings: `NODE_ENV=production`, `APP_ORIGIN=https://your-domain.example`, `COOKIE_SECURE=1`, `MONGODB_URI`, and optional `BIOMETRIC_KEY`. Set `TRUST_PROXY=1` only behind one trusted proxy. Render's start command sets `APP_ORIGIN` from its documented `RENDER_EXTERNAL_URL`. The Node service binds `0.0.0.0` and uses `PORT`.

## How comparison works—and its limits

Face: face-api tiny detector + tiny landmarks + 128-dimensional recognition descriptors. Voice: SpeechBrain-derived ECAPA-TDNN ONNX model with SpeechBrain-compatible 16 kHz filterbank preprocessing and 192-dimensional embeddings. No age, gender or emotion classifiers are enabled.

Raw enrollment photos/audio stay in the browser. Descriptors are sent over HTTPS and encrypted in MongoDB. Templates are not returned to teachers or other students. Comparison is only against the authenticated student's own enrollment; there is no classroom-wide face search. Recent comparison summaries (not templates) can be attached to a pending check-in for five minutes.

**This is a research/prototype signal, not a trusted identity or authentication factor.** Browser-provided descriptors can be forged. Photo/video/audio replay, liveness and voice-clone defenses are not implemented. Thresholds (face Euclidean distance 0.5; voice cosine similarity 0.65) are starting values, not calibrated school-specific operating points. No measured real-world false-accept/false-reject rate or biometric accuracy is claimed. Enrollment is self-service and is not a teacher-witnessed identity ceremony. Teachers retain final attendance review and manual check-in remains available. Do not market it as a fraud-proof or production-certified biometric attendance product.

Browser voice **roll-call** is a separate feature: it transcribes responses using the browser speech service, which may process microphone audio externally. ECAPA voice comparison does not transcribe or verify the spoken phrase.

## Verification

```sh
npm run build
npm run test:unit
npm run test:frontend
npm run test:models
npm test
```

- Unit/component suites cover authorization, encrypted templates/tamper detection, consent/deletion, invalid descriptors, camera/microphone cleanup, QR invitations, demo interactions and metric definitions.
- `test:models` performs real ONNX inference on synthetic input to verify the tensor contract and finite outputs. It is **not** a speaker accuracy benchmark.
- Audio preprocessing was checked against an independent NumPy FFT reference (maximum absolute feature error approximately 0.000021 on the test waveform).
- `npm test` starts a real ephemeral MongoDB via mongodb-memory-server. It requires an environment that permits running mongod; alternatively set `TEST_MONGODB_URI` for an isolated test database. CI runs on Ubuntu. Restricted sandbox environments may block mongod.
- Physical-device camera/microphone behavior and same/different-person recognition must still be tested with consenting participants on target browsers.

## Architecture

`frontend/src/Marketing.jsx` and `WorkspaceExtras.jsx` implement the product site, offline demo, invitations, directory and insights. `MediaSetup.jsx` manages device tests. `BiometricPanel.jsx` handles opt-in enrollment/comparison while `biometrics.js` lazy-loads models and extracts embeddings. `backend/src/app.js` authorizes attendance workflows; `backend/src/biometrics.js` validates, encrypts and compares templates; `db.js` creates MongoDB indexes.

Sessions use random hashed tokens, expiration/TTL cleanup, HttpOnly/SameSite cookies and salted scrypt passwords. A unique partial MongoDB index enforces one active session per class; attendance has a unique session/student index. Student check-ins cannot directly mark themselves present. The earlier Python/SQLite version is removed; old SQLite records and sessions are not automatically imported.

## Before an institutional rollout

The current product is a portfolio/pilot MVP. Teacher registration remains self-service in pilot unless approval is enabled. Production requires verified email and approval by a verified configured administrator. MongoDB-backed rate limits and activity logs are enabled in the hosted server; history responses are bounded to 100 sessions and exports state that limit. This is a single-institution deployment, not delegated multi-institution SaaS. Privacy/consent administration, managed backups, transactional integration tests and operational acceptance remain necessary. Insights use the current class roster across closed sessions, so changing enrollment can affect historical rates. No real customer counts, commercial adoption or business outcomes are asserted.
