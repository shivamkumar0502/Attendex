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


test("attendance history paginates older sessions with class-scoped authorization", async () => {
  const teacher = request.agent(app);
  const student = request.agent(app);
  const outsider = request.agent(app);
  await register(teacher, "HistoryProfessor", "teacher");
  await register(student, "HistoryStudent", "student");
  await register(outsider, "HistoryOutsider", "teacher");

  await teacher.post("/api/classes").send({ name: "History Class" }).expect(201);
  const classroom = (await teacher.get("/api/state").expect(200)).body.classes[0];
  await student.post("/api/join").send({ code: classroom.code }).expect(200);
  const studentId = (await student.get("/api/state").expect(200)).body.user.id;

  const now = Math.floor(Date.now() / 1000);
  const sessions = Array.from({ length: 130 }, (_, index) => ({
    _id: (index + 1).toString(16).padStart(24, "0"),
    classId: classroom.id,
    created: now - index,
    rosterSize: 1,
    active: false,
  }));
  await db.collection("lessons").insertMany(sessions);
  await db.collection("attendance").insertMany([
    { lesson: sessions[120]._id, student: studentId, status: "present" },
    { lesson: sessions[124]._id, student: studentId, status: "late" },
  ]);

  const initial = (await teacher.get("/api/state").expect(200)).body.classes[0];
  assert.equal(initial.lessons.length, 100);
  assert.ok(initial.historyCursor);

  const first = await teacher
    .get(`/api/history?classId=${classroom.id}&cursor=${encodeURIComponent(initial.historyCursor)}&limit=25`)
    .expect(200);
  assert.equal(first.body.lessons.length, 25);
  assert.equal(first.body.hasMore, true);
  assert.deepEqual(first.body.attendance.map((row) => row.status), ["present", "late"]);
  assert.equal(first.body.lessons[0].id, sessions[100]._id);

  const second = await teacher
    .get(`/api/history?classId=${classroom.id}&cursor=${encodeURIComponent(first.body.nextCursor)}&limit=25`)
    .expect(200);
  assert.equal(second.body.lessons.length, 5);
  assert.equal(second.body.hasMore, false);
  assert.equal(second.body.nextCursor, null);

  const studentPage = await student
    .get(`/api/history?classId=${classroom.id}&cursor=${encodeURIComponent(initial.historyCursor)}&limit=25`)
    .expect(200);
  assert.equal(studentPage.body.attendance.length, 2);
  assert.ok(studentPage.body.attendance.every((row) => row.student === studentId));

  await outsider
    .get(`/api/history?classId=${classroom.id}&cursor=${encodeURIComponent(initial.historyCursor)}`)
    .expect(403);
  await teacher
    .get(`/api/history?classId=${classroom.id}&cursor=invalid`)
    .expect(400);
});


test("attendance history filters by date range and status with student isolation", async () => {
  const teacher = request.agent(app);
  const student = request.agent(app);
  await register(teacher, "FilterProfessor", "teacher");
  await register(student, "FilterStudent", "student");
  await teacher.post("/api/classes").send({ name: "Filter Class" }).expect(201);
  const classroom = (await teacher.get("/api/state").expect(200)).body.classes[0];
  await student.post("/api/join").send({ code: classroom.code }).expect(200);
  const studentId = (await student.get("/api/state").expect(200)).body.user.id;
  const now = Math.floor(Date.now() / 1000);
  const lessons = [
    { _id: "000000000000000000000101", classId: classroom.id, created: now - 3600, rosterSize: 1, active: false },
    { _id: "000000000000000000000102", classId: classroom.id, created: now - 86400 * 3, rosterSize: 1, active: false },
    { _id: "000000000000000000000103", classId: classroom.id, created: now - 86400 * 8, rosterSize: 1, active: false },
  ];
  await db.collection("lessons").insertMany(lessons);
  await db.collection("attendance").insertMany([
    { lesson: lessons[0]._id, student: studentId, status: "present" },
    { lesson: lessons[1]._id, student: studentId, status: "late" },
    { lesson: lessons[2]._id, student: studentId, status: "absent" },
  ]);
  const today = new Date(now * 1000).toISOString().slice(0, 10);
  const weekAgo = new Date((now - 7 * 86400) * 1000).toISOString().slice(0, 10);
  const present = await teacher
    .get(`/api/history?classId=${classroom.id}&from=${weekAgo}&status=present`)
    .expect(200);
  assert.deepEqual(present.body.lessons.map((lesson) => lesson.id), [lessons[0]._id]);
  assert.deepEqual(present.body.attendance.map((record) => record.status), ["present"]);
  const studentPage = await student
    .get(`/api/history?classId=${classroom.id}&from=${weekAgo}`)
    .expect(200);
  assert.ok(studentPage.body.attendance.every((record) => record.student === studentId));
  await teacher
    .get(`/api/history?classId=${classroom.id}&from=${today}&to=${weekAgo}`)
    .expect(400);
  await teacher
    .get(`/api/history?classId=${classroom.id}&status=unknown`)
    .expect(400);
  await teacher
    .get(`/api/history?classId=${classroom.id}&tzOffset=900`)
    .expect(400);
});
