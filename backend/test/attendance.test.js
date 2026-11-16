import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDatabase } from "../src/db.js";
import { createApp } from "../src/app.js";
let mongo, client, db, app;
before(async () => {
  const uri =
    process.env.TEST_MONGODB_URI ||
    (mongo = await MongoMemoryServer.create()).getUri();
  ({ client, db } = await connectDatabase(uri, "attendex_test_" + Date.now()));
  app = createApp(db);
});
after(async () => {
  await db?.dropDatabase();
  await client?.close();
  await mongo?.stop();
});
const register = (agent, name, role) =>
  agent
    .post("/api/register")
    .send({
      name,
      role,
      email: name + "@test.edu",
      password: "test-password-123",
    })
    .expect(200);
test("Mongo-backed teacher/student workflow, authorization and session lifecycle", async () => {
  const teacher = request.agent(app),
    student = request.agent(app),
    outsider = request.agent(app);
  await register(teacher, "Professor", "teacher");
  await register(student, "Student", "student");
  await register(outsider, "Other", "teacher");
  await request(app).get("/api/state").expect(401);
  await student.post("/api/classes").send({ name: "No access" }).expect(403);
  await teacher
    .post("/api/classes")
    .send({ name: "Computer Networks", section: "CSE A" })
    .expect(201);
  let cl = (await teacher.get("/api/state").expect(200)).body.classes[0];
  await student
    .post("/api/join")
    .send({ code: cl.code.toLowerCase() })
    .expect(200);
  await student.post("/api/join").send({ code: cl.code }).expect(200);
  await outsider.post("/api/lessons").send({ classId: cl.id }).expect(404);
  await teacher.post("/api/lessons").send({ classId: cl.id }).expect(201);
  await teacher.post("/api/lessons").send({ classId: cl.id }).expect(409);
  cl = (await teacher.get("/api/state")).body.classes[0];
  assert.equal(cl.studentCount, 1);
  const lesson = cl.lessons[0].id;
  assert.equal(cl.lessons[0].rosterSize, 1, "session must snapshot the enrolled roster");
  const studentState = (await student.get("/api/state")).body;
  assert.equal(studentState.classes[0].code, undefined);
  assert.deepEqual(studentState.classes[0].students, []);
  const sid = studentState.user.id;
  await student
    .post("/api/attendance")
    .send({ lesson, status: "present" })
    .expect(200);
  assert.equal(
    (await student.get("/api/state")).body.classes[0].attendance[0].status,
    "pending",
  );
  await student.post("/api/attendance").send({ lesson }).expect(200);
  assert.equal(
    (await student.get("/api/state")).body.classes[0].attendance.length,
    1,
    "retries must not create duplicate attendance rows",
  );
  await outsider
    .post("/api/attendance")
    .send({ lesson, student: sid, status: "present" })
    .expect(403);
  await teacher
    .post("/api/attendance")
    .send({ lesson, student: sid, status: "present" })
    .expect(200);
  assert.equal(
    (await student.get("/api/state")).body.classes[0].attendance[0].status,
    "present",
  );
  await teacher.post("/api/close").send({ lesson }).expect(200);
  await student.post("/api/attendance").send({ lesson }).expect(403);
  await student.post("/api/logout").send({}).expect(200);
  await student.get("/api/state").expect(401);
  await student
    .post("/api/login")
    .send({ email: "Student@test.edu", password: "incorrect-password" })
    .expect(401);
  await student
    .post("/api/login")
    .send({ email: "Student@test.edu", password: "test-password-123" })
    .expect(200);
  assert.equal((await student.get("/api/state")).body.classes.length, 1);
});
test("rejects cross-origin mutations, invalid bodies and injection-shaped input", async () => {
  await request(app)
    .post("/api/register")
    .set("Origin", "https://untrusted.example")
    .send({})
    .expect(403);
  await request(app)
    .post("/api/login")
    .send({ email: { $ne: null }, password: "test-password-123" })
    .expect(400);
  await request(app)
    .post("/api/register")
    .send({
      name: "A",
      role: "admin",
      email: "a@test.edu",
      password: "test-password-123",
    })
    .expect(400);
  await request(app)
    .post("/api/register")
    .send({
      name: "A",
      role: "teacher",
      email: "a@test.edu",
      password: "short",
    })
    .expect(400);
  await request(app)
    .post("/api/login")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
});

test("duplicate registration returns a clear conflict and keeps email case-insensitive", async () => {
  await request(app)
    .post("/api/register")
    .send({
      name: "First Account",
      role: "student",
      email: "duplicate@test.edu",
      password: "test-password-123",
    })
    .expect(200);

  const duplicate = await request(app)
    .post("/api/register")
    .send({
      name: "Second Account",
      role: "teacher",
      email: "DUPLICATE@Test.edu",
      password: "another-password-123",
    })
    .expect(409);

  assert.equal(
    duplicate.body.error,
    "An account with this email already exists.",
  );
  assert.equal(
    await db.collection("users").countDocuments({ email: "duplicate@test.edu" }),
    1,
  );
});

test("abandoned attendance sessions expire and no longer block a new session", async () => {
  const teacher = request.agent(app);
  const student = request.agent(app);
  await register(teacher, "ExpiryProfessor", "teacher");
  await register(student, "ExpiryStudent", "student");

  await teacher.post("/api/classes").send({ name: "Expiry Test" }).expect(201);
  const cl = (await teacher.get("/api/state").expect(200)).body.classes[0];
  await student.post("/api/join").send({ code: cl.code }).expect(200);
  await teacher.post("/api/lessons").send({ classId: cl.id }).expect(201);

  let state = (await teacher.get("/api/state").expect(200)).body;
  const abandoned = state.classes[0].lessons[0];
  await db.collection("lessons").updateOne(
    { _id: abandoned.id },
    { $set: { created: Math.floor(Date.now() / 1000) - 9 * 60 * 60 } },
  );

  await student.post("/api/attendance").send({ lesson: abandoned.id }).expect(403);
  state = (await teacher.get("/api/state").expect(200)).body;
  assert.equal(state.classes[0].lessons[0].active, false);
  await teacher.post("/api/lessons").send({ classId: cl.id }).expect(201);
  state = (await teacher.get("/api/state").expect(200)).body;
  assert.equal(state.classes[0].lessons[0].active, true);
  assert.equal(state.classes[0].lessons[1].active, false);
});
