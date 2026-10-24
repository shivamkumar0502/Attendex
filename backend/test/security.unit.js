import { processEmailJobs } from "../src/email-jobs.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  MongoRateStore,
  readiness,
  validateProduction,
  digest,
} from "../src/security.js";
import { approvedCandidate } from "../src/trusted-face.js";
function fixture({ verified = false, role = "student", mailer = null } = {}) {
  const user = {
      _id: "a".repeat(24),
      email: "owner@example.test",
      name: "Owner",
      role,
      emailVerified: verified,
    },
    jobs = [],
    tokens = [],
    sent = [],
    updates = [],
    sessionRevocations = [];
  const tokenCollection = {
    deleteMany: async () => {
      tokens.length = 0;
    },
    insertOne: async (item) => tokens.push(item),
    findOneAndDelete: async (query) => {
      const i = tokens.findIndex(
        (t) =>
          t.token === query.token &&
          t.kind === query.kind &&
          t.expires > new Date(),
      );
      return i < 0 ? null : tokens.splice(i, 1)[0];
    },
  };
  const db = {
    collection(name) {
      if (name === "users")
        return {
          findOne: async (query) =>
            query.email && query.email !== user.email ? null : user,
          updateOne: async (query, update) => {
            updates.push({ query, update });
            Object.assign(user, update.$set);
            return { matchedCount: 1 };
          },
        };
      if (name === "mailJobs")
        return {
          insertOne: async (item) => {
            if (jobs.some((j) => j._id === item._id))
              throw Object.assign(Error("duplicate"), { code: 11000 });
            jobs.push(item);
          },
          findOneAndUpdate: async (q, update) => {
            const item = jobs.find(
              (j) => j.status === "queued" && j.nextAttempt <= new Date(),
            );
            if (!item) return null;
            Object.assign(item, update.$set);
            return { ...item };
          },
          updateOne: async (q, update) => {
            const item = jobs.find((j) => j._id === q._id);
            if (item) {
              Object.assign(item, update.$set || {});
              for (const key of Object.keys(update.$unset || {}))
                delete item[key];
            }
          },
          deleteOne: async (q) => {
            const index = jobs.findIndex((j) => j._id === q._id);
            if (index >= 0) jobs.splice(index, 1);
          },
        };
      if (name === "accountTokens") return tokenCollection;
      if (name === "sessions")
        return {
          findOne: async () => ({ userId: user._id }),
          deleteMany: async (q) => sessionRevocations.push(q),
        };
      return {
        find: () => ({
          sort: () => ({ limit: () => ({ toArray: async () => [] }) }),
        }),
        insertOne: async () => {},
      };
    },
  };
  const config = {
    adminEmails: ["owner@example.test"],
    mailKey: "12".repeat(32),
    mailer:
      mailer === true
        ? { send: async (message) => sent.push(message) }
        : mailer,
    origin: "https://attendex.example.test",
  };
  return {
    app: createApp(db, config),
    user,
    tokens,
    jobs,
    sent,
    updates,
    sessionRevocations,
    db,
    config,
  };
}
test("an unverified account cannot claim configured administrator email privileges", async () => {
  const f = fixture({ role: "teacher" });
  await request(f.app).get("/api/admin/readiness").expect(403);
  assert.equal((await request(f.app).get("/api/account")).body.isAdmin, false);
});
test("verification tokens are hashed, single-use and expire; raw token only goes to the configured mailer", async () => {
  const f = fixture({ mailer: true });
  await request(f.app).post("/api/auth/email/request").send({}).expect(200);
  assert.equal(f.sent.length, 0);
  await processEmailJobs(f.db, f.config);
  const link = f.sent[0].text.match(/https:\/\/[^\s]+/)[0],
    token = new URLSearchParams(new URL(link).hash.slice(1)).get("verify");
  assert.equal(f.tokens[0].token, digest(token));
  assert.notEqual(f.tokens[0].token, token);
  await request(f.app)
    .post("/api/auth/email/complete")
    .send({ token })
    .expect(200);
  assert.equal(f.user.emailVerified, true);
  await request(f.app)
    .post("/api/auth/email/complete")
    .send({ token })
    .expect(400);
  await request(f.app).get("/api/admin/readiness").expect(200);
});
test("password reset revokes all sessions and cannot replay a consumed link", async () => {
  const f = fixture({ mailer: true });
  await request(f.app)
    .post("/api/auth/reset/request")
    .send({ email: "owner@example.test" })
    .expect(202);
  await processEmailJobs(f.db, f.config);
  const link = f.sent[0].text.match(/https:\/\/[^\s]+/)[0],
    token = new URLSearchParams(new URL(link).hash.slice(1)).get("reset");
  await request(f.app)
    .post("/api/auth/reset/complete")
    .send({ token, newPassword: "a-new-long-password" })
    .expect(200);
  assert.match(f.user.password, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal(f.sessionRevocations[0].userId, f.user._id);
  await request(f.app)
    .post("/api/auth/reset/complete")
    .send({ token, newPassword: "another-long-password" })
    .expect(400);
});
test("teacher approval writes only a verified teacher target and records the approving administrator", async () => {
  const f = fixture({ verified: true, role: "teacher" });
  await request(f.app)
    .post("/api/admin/teachers/approve")
    .send({ userId: "b".repeat(24) })
    .expect(200);
  assert.deepEqual(f.updates[0].query, {
    _id: "b".repeat(24),
    role: "teacher",
    emailVerified: true,
  });
  assert.equal(f.updates[0].update.$set.approvedBy, f.user._id);
});
test("shared limiter uses atomic database keys and never stores the raw IP address", async () => {
  let hits = 0;
  const filters = [];
  const collection = {
    findOneAndUpdate: async (f, u, options) => {
      filters.push(f);
      assert.ok(u[0].$set.hits.$cond);
      return { hits: ++hits, resetAt: new Date(Date.now() + 1000) };
    },
  };
  const a = new MongoRateStore(collection, "auth"),
    b = new MongoRateStore(collection, "auth");
  a.init({ windowMs: 1000 });
  b.init({ windowMs: 1000 });
  assert.equal((await a.increment("192.0.2.1")).totalHits, 1);
  assert.equal((await b.increment("192.0.2.1")).totalHits, 2);
  assert.deepEqual(filters[0], filters[1]);
  assert(!filters[0]._id.includes("192.0.2.1"));
});
test("production activation cannot silently accept unvalidated voice anti-spoofing or operational readiness", () => {
  assert.equal(readiness({}).checks.voiceAntiSpoofing, false);
  assert.doesNotThrow(() => validateProduction({ strictProduction: false }));
  assert.throws(
    () => validateProduction({ strictProduction: true }),
    /Production activation blocked/,
  );
});
test("managed face matching refuses unknown winners, ambiguous scores and cross-roster identities", () => {
  const allowed = new Map([["known", "student1"]]);
  assert.equal(
    approvedCandidate(
      [{ faceId: "known", student: "student1", similarity: 99.5 }],
      allowed,
    ).student,
    "student1",
  );
  assert.equal(
    approvedCandidate(
      [
        { faceId: "unknown", student: "student2", similarity: 100 },
        { faceId: "known", student: "student1", similarity: 99.5 },
      ],
      allowed,
    ),
    null,
  );
  assert.equal(
    approvedCandidate(
      [
        { faceId: "known", student: "student1", similarity: 99.5 },
        { faceId: "other", student: "student2", similarity: 98 },
      ],
      allowed,
    ),
    null,
  );
  assert.equal(
    approvedCandidate(
      [{ faceId: "known", student: "student2", similarity: 100 }],
      allowed,
    ),
    null,
  );
});
test("disabled managed provider fails closed without accepting file uploads", async () => {
  const f = fixture({ verified: true, role: "teacher" });
  await request(f.app)
    .post("/api/trusted-face/photos")
    .field("classId", "b".repeat(24))
    .attach("photos", Buffer.from("not an image"), "test.jpg")
    .expect(503);
});

test("unknown account recovery takes the same queue path without exposing account existence", async () => {
  const f = fixture({ mailer: true });
  await request(f.app)
    .post("/api/auth/reset/request")
    .send({ email: "unknown@example.test" })
    .expect(202);
  assert.equal(f.jobs.length, 1);
  assert(!JSON.stringify(f.jobs).includes("unknown@example.test"));
  await processEmailJobs(f.db, f.config);
  assert.equal(f.sent.length, 0);
  assert.equal(f.tokens.length, 0);
});
