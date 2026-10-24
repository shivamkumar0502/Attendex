import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { trustedFaceRoutes } from "../src/trusted-face.js";
const uid = "a".repeat(24),
  classId = "b".repeat(24),
  lesson = "c".repeat(24),
  student = "d".repeat(24);
function fixture({ owner = true, approved = true } = {}) {
  let proposal;
  const operations = [];
  const db = {
    collection(name) {
      if (name === "classes")
        return {
          findOne: async () =>
            owner ? { _id: classId, teacher: uid, members: [student] } : null,
        };
      if (name === "lessons")
        return {
          findOne: async () => ({ _id: lesson, classId, active: true }),
        };
      if (name === "faceEnrollments")
        return {
          find: () => ({
            toArray: async () => [
              { student, faceIds: ["face1"], status: "approved" },
            ],
          }),
        };
      if (name === "photoProposals")
        return {
          insertOne: async (p) => {
            proposal = p;
          },
          findOne: async (q) =>
            proposal && !proposal.used && q._id === proposal._id
              ? proposal
              : null,
          updateOne: async () => {
            proposal.used = true;
          },
        };
      if (name === "attendance")
        return { bulkWrite: async (ops) => operations.push(...ops) };
      return { insertOne: async () => {} };
    },
  };
  const provider = {
    search: async () => [
      {
        box: { Left: 0.1, Top: 0.1, Width: 0.2, Height: 0.2 },
        matches: [{ student, faceId: "face1", similarity: 99.7 }],
      },
    ],
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = {
      _id: uid,
      emailVerified: true,
      teacherApproved: approved,
      role: "teacher",
    };
    next();
  });
  trustedFaceRoutes(app, {
    db,
    provider,
    transaction: async (work) => work(undefined),
  });
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  return { app, operations, getProposal: () => proposal };
}
test("photo analysis only creates a proposal; explicit reviewed confirmation writes attendance once", async () => {
  const f = fixture();
  const r = await request(f.app)
    .post("/api/trusted-face/photos?classId=" + classId)
    .field("classId", classId)
    .field("lesson", lesson)
    .field("consent", "true")
    .attach("photos", Buffer.from("provider fixture"), "class.jpg")
    .expect(200);
  assert.equal(f.operations.length, 0);
  assert.equal(r.body.candidates[0].student, student);
  await request(f.app)
    .post("/api/trusted-face/confirm")
    .send({
      classId,
      proposalId: r.body.proposalId,
      selections: [{ student, status: "present" }],
    })
    .expect(200);
  assert.equal(f.operations[0].updateOne.filter.student, student);
  assert.equal(f.operations[0].updateOne.update.$set.status, "present");
  await request(f.app)
    .post("/api/trusted-face/confirm")
    .send({
      classId,
      proposalId: r.body.proposalId,
      selections: [{ student, status: "present" }],
    })
    .expect(409);
  assert.equal(f.operations.length, 1);
});
test("class ownership and teacher approval are checked before photo parsing", async () => {
  for (const fixtureOptions of [{ owner: false }, { approved: false }]) {
    const f = fixture(fixtureOptions);
    const r = await request(f.app)
      .post("/api/trusted-face/photos?classId=" + classId)
      .field("classId", classId)
      .attach("photos", Buffer.from("unauthorized"), "class.jpg");
    assert([403, 404].includes(r.status));
    assert.equal(f.getProposal(), undefined);
  }
});
test("cannot confirm students outside the candidate proposal or without reviewed selections", async () => {
  const f = fixture();
  const r = await request(f.app)
    .post("/api/trusted-face/photos?classId=" + classId)
    .field("classId", classId)
    .field("lesson", lesson)
    .field("consent", "true")
    .attach("photos", Buffer.from("provider fixture"), "class.jpg")
    .expect(200);
  await request(f.app)
    .post("/api/trusted-face/confirm")
    .send({ classId, proposalId: r.body.proposalId, selections: [] })
    .expect(400);
  await request(f.app)
    .post("/api/trusted-face/confirm")
    .send({
      classId,
      proposalId: r.body.proposalId,
      selections: [{ student: "e".repeat(24), status: "present" }],
    })
    .expect(400);
  assert.equal(f.operations.length, 0);
});
