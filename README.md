# Attendex

A responsive classroom attendance application with a forest-green and lime interface. Built for students and teachers, with persistent server-side records rather than local-storage mock data.

## Run

Python 3.11+; no third-party packages required.

```sh
python server.py
```

Open http://localhost:8000. Create a teacher account and a student account (use separate browser profiles), create a class, copy its code, and join as the student. The teacher starts a session; students submit check-ins for review. Teachers mark present, late, or absent, close sessions, and export CSV records. Unmarked students are never silently marked absent.

```sh
python -m unittest -v test_app.py
node --check public/app.js
```

## Voice assistance

The browser reads student names aloud using speech synthesis and captures spoken responses using its SpeechRecognition implementation where available. Teachers review each response before explicitly confirming attendance. This is speech transcription, **not biometric speaker verification**. Manual attendance works without microphone permission or speech support. Browser speech services may send audio to their provider; inform users before enabling the microphone. HTTPS is needed outside localhost.

Face recognition, biometric enrollment and speaker identity matching are not implemented. No images, voiceprints or raw recordings are stored. The landing-page illustration is explicitly a workspace preview; authenticated dashboards start empty.

## Configuration

- `PORT`: HTTP port, default 8000.
- `DATABASE_PATH`: SQLite database file, default `data/attendex.db`.
- `COOKIE_SECURE=1`: set behind HTTPS in deployment.

Passwords use salted scrypt. Sessions use random tokens, hashed at rest, HttpOnly/SameSite cookies and 24-hour expiration. Every attendance mutation checks class ownership or enrolled student membership. Student check-ins always remain pending until teacher approval. CSV cells are escaped to reduce spreadsheet formula injection.

## Deployment and scale

Run `python server.py` behind an HTTPS reverse proxy. Attach persistent storage for the database and schedule backups; ephemeral hosts otherwise lose records on restart. SQLite and Python's built-in HTTP server are a **single-instance MVP**, not a production school-wide deployment. Mobile/tablet layouts adapt at 700px and 1050px.

Before institutional deployment, migrate to a production application server and PostgreSQL, add organization/institution isolation and teacher invitation approval, rate limiting, email verification/reset, audit logs, retention controls and monitoring. Teacher registration is self-service for this MVP. Do not expose it as an institution-authorized identity system without provisioning controls. There is no AI identity model or accuracy claim.
