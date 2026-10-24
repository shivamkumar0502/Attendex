import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  seal,
  unseal,
  compare,
  validVector,
  models,
} from "../src/biometrics.js";
const key = "ab".repeat(32);
const vector = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0));
function fixture(role = "student", enabled = true) {
  const user = { _id: "a".repeat(24), name: "Test", role, biometrics: {} };
  const db = {
    collection(name) {
      if (name === "users")
        return {
          findOne: async () => user,
          updateOne: async (filter, update) => {
            assert.equal(filter._id, user._id);
            for (const [path, value] of Object.entries(update.$set || {})) {
              const [group, field] = path.split(".");
              user[group] ??= {};
              user[group][field] = value;
            }
            for (const path of Object.keys(update.$unset || {})) {
              const [group, field] = path.split(".");
              if (field) delete user[group]?.[field];
              else delete user[group];
            }
          },
        };
      return { findOne: async () => ({ userId: user._id }) };
    },
  };
  return {
    app: createApp(db, { biometricKey: enabled ? key : undefined }),
    user,
  };
}
test("AES-GCM templates roundtrip and reject tampered ciphertext", () => {
  const encrypted = seal([[1, 2, 3]], key);
  assert.deepEqual(unseal(encrypted, key), [[1, 2, 3]]);
  assert.throws(() =>
    unseal({ ...encrypted, tag: Buffer.alloc(16).toString("base64") }, key),
  );
  assert.notEqual(encrypted.data, JSON.stringify([[1, 2, 3]]));
});
test("model comparison handles same/different vectors and invalid descriptors", () => {
  for (const kind of ["face", "voice"]) {
    const v = vector(kind === "face" ? 128 : 192),
      other = [...v];
    other[0] = 0;
    other[1] = 1;
    assert.equal(validVector(v, kind), true);
    assert.equal(
      validVector(
        v.map(() => 0),
        kind,
      ),
      false,
    );
    assert.equal(compare(v, [v], kind).result, "match");
    assert.equal(compare(other, [v], kind).result, "review");
    assert.equal(validVector([NaN], kind), false);
  }
});
test("consented enrollment, own verification and deletion work without exposing templates", async () => {
  const { app, user } = fixture();
  const v = vector(128);
  await request(app)
    .post("/api/biometrics/enroll")
    .send({ kind: "face", model: models.face, consent: true, samples: [v, v] })
    .expect(200);
  assert.ok(user.biometrics.face.sealed);
  const profile = (await request(app).get("/api/biometrics")).body;
  assert.deepEqual(profile, {
    enabled: true,
    face: true,
    voice: false,
    experimental: true,
  });
  const result = (
    await request(app)
      .post("/api/biometrics/verify")
      .send({ kind: "face", model: models.face, vector: v })
      .expect(200)
  ).body;
  assert.equal(result.result, "match");
  assert.equal(result.experimental, true);
  await request(app).post("/api/biometrics/delete").send({}).expect(200);
  assert.equal(user.biometrics, undefined);
  assert.equal(user.biometricSignals, undefined);
});
test("rejects missing consent, wrong model, teacher enrollment and disabled configuration", async () => {
  const { app } = fixture();
  const data = {
    kind: "face",
    model: models.face,
    samples: [vector(128), vector(128)],
  };
  await request(app).post("/api/biometrics/enroll").send(data).expect(400);
  await request(app)
    .post("/api/biometrics/enroll")
    .send({ ...data, consent: true, model: "wrong-model" })
    .expect(400);
  await request(fixture("teacher").app)
    .post("/api/biometrics/enroll")
    .send({ ...data, consent: true })
    .expect(403);
  await request(fixture("student", false).app)
    .post("/api/biometrics/enroll")
    .send({ ...data, consent: true })
    .expect(503);
  await request(app)
    .post("/api/biometrics/verify")
    .send({ kind: "face", model: models.face, vector: vector(128) })
    .expect(409);
});
