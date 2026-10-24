import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
const db = {
  collection() {
    return { findOne: async () => null };
  },
  command: async () => ({ ok: 1 }),
};
const app = createApp(db, { origin: "http://localhost:5173" });
test("requires authentication and does not leak server details", async () => {
  const r = await request(app).get("/api/state").expect(401);
  assert.equal(r.headers["x-powered-by"], undefined);
  assert.equal(r.headers["cache-control"], "no-store");
});
test("rejects cross-origin requests before database operations", async () => {
  await request(app)
    .post("/api/register")
    .set("Origin", "https://untrusted.example")
    .send({})
    .expect(403);
});
test("validates email, password, role and malformed JSON", async () => {
  for (const payload of [
    { email: { $ne: null }, password: "test-password-123" },
    { email: "a@test.edu", password: "short" },
    {
      name: "Name",
      role: "admin",
      email: "a@test.edu",
      password: "test-password-123",
    },
  ])
    await request(app).post("/api/register").send(payload).expect(400);
  await request(app)
    .post("/api/login")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
});
test("database health endpoint reports success", async () => {
  await request(app).get("/api/health").expect(200, { ok: true });
});
