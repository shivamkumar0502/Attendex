import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
test("signup creates a usable session and login verifies the stored password", async () => {
  let user;
  const savedSessions = [];
  const db = {
    collection(name) {
      if (name === "users")
        return {
          insertOne: async (value) => {
            if (user) throw Object.assign(Error("duplicate"), { code: 11000 });
            user = value;
          },
          findOne: async () => user,
        };
      if (name === "sessions")
        return { insertOne: async (value) => savedSessions.push(value) };
      return {};
    },
  };
  const app = createApp(db);
  const payload = {
    name: "Test Student",
    email: "signup@example.test",
    password: "long-test-password",
    role: "student",
  };
  const created = await request(app)
    .post("/api/register")
    .send(payload)
    .expect(200);
  assert.equal(created.body.user.name, payload.name);
  assert.equal(created.body.user.role, "student");
  assert.ok(
    created.headers["set-cookie"]?.some((value) => value.includes("HttpOnly")),
  );
  assert.notEqual(user.password, payload.password);
  assert.equal(savedSessions.length, 1);
  await request(app).post("/api/login").send(payload).expect(200);
  await request(app)
    .post("/api/login")
    .send({ ...payload, password: "incorrect-password" })
    .expect(401);
  await request(app).post("/api/register").send(payload).expect(409);
});
