import { trustedFaceRoutes } from "./trusted-face.js";
import { MongoRateStore, securityRoutes } from "./security.js";
import { biometricRoutes } from "./biometrics.js";
import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
const scrypt = promisify(scryptCallback),
  id = () => randomBytes(12).toString("hex"),
  hash = (s) => createHash("sha256").update(s).digest("hex");
const publicUser = (u) => ({
  id: u._id,
  name: u.name,
  role: u.role,
  emailVerified: !!u.emailVerified,
  teacherApproved: !!u.teacherApproved,
  setup: {
    completed: !!u.setup?.completed,
    cameraTested: !!u.setup?.cameraTested,
    micTested: !!u.setup?.micTested,
  },
});
const text = (v, max = 100) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const validId = (v) => typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
async function password(value, salt = randomBytes(16).toString("hex")) {
  return salt + ":" + (await scrypt(value, salt, 64)).toString("hex");
}
function fail(res, status, error) {
  return res.status(status).json({ error });
}
export function createApp(db, config = {}) {
  const app = express(),
    users = db.collection("users"),
    sessions = db.collection("sessions"),
    classes = db.collection("classes"),
    lessons = db.collection("lessons"),
    attendance = db.collection("attendance");
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          mediaSrc: ["'self'", "blob:"],
          scriptSrc: [
            "'self'",
            "'wasm-unsafe-eval'",
            ...(config.faceProvider
              ? ["https://cdn.liveness.rekognition.amazonaws.com"]
              : []),
          ],
          connectSrc: [
            "'self'",
            ...(config.faceProvider
              ? [
                  "https://rekognition." +
                    config.faceProvider.region +
                    ".amazonaws.com",
                  "wss://streaming-rekognition." +
                    config.faceProvider.region +
                    ".amazonaws.com",
                  "https://cdn.liveness.rekognition.amazonaws.com",
                ]
              : []),
          ],
          imgSrc: ["'self'", "data:", "blob:"],
          workerSrc: ["'self'", "blob:"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api",
    rateLimit({
      ...(config.distributedLimits
        ? { store: new MongoRateStore(db.collection("rateLimits"), "api") }
        : {}),
      skip: (req) => req.path === "/health",
      message: { error: "Too many requests. Please wait before trying again." },
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure: !!config.secureCookies,
    path: "/",
  };
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (req.method !== "GET" && req.headers.origin) {
      const expected = config.origin || `${req.protocol}://${req.get("host")}`;
      if (req.headers.origin !== expected)
        return fail(res, 403, "Invalid origin");
    }
    next();
  });
  let healthPromise,
    healthUntil = 0;
  app.get("/api/health", async (req, res) => {
    if (!healthPromise || Date.now() >= healthUntil) {
      healthPromise = db.command({ ping: 1 });
      healthUntil = Date.now() + 1000;
    }
    await healthPromise;
    res.json({ ok: true });
  });
  const authLimiter = rateLimit({
    ...(config.distributedLimits
      ? { store: new MongoRateStore(db.collection("rateLimits"), "auth") }
      : {}),
    message: {
      error: "Too many authentication attempts. Please try again later.",
    },
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.use("/api/auth", authLimiter);
  const security = securityRoutes(app, {
    db,
    config,
    cookieOptions,
    password,
    publicUser,
  });
  app.post(["/api/register", "/api/login"], authLimiter, async (req, res) => {
    const email = text(req.body.email, 254).toLowerCase(),
      p = req.body.password;
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof p !== "string" ||
      p.length < 10 ||
      p.length > 128
    )
      return fail(
        res,
        400,
        "Enter a valid email and a password of 10–128 characters.",
      );
    if (req.path === "/api/register") {
      if(p.length<12) return fail(res,400,"Use at least 12 characters for a new password.");
      const name = text(req.body.name),
        role = req.body.role;
      if (!name || !["teacher", "student"].includes(role))
        return fail(res, 400, "Enter your name and role.");
      await users.insertOne({
        _id: id(),
        name,
        email,
        password: await password(p),
        role,
        teacherApproved: false,
        createdAt: new Date(),
      });
    }
    const user = await users.findOne({ email });
    if (!user) {
      await password(p, "00000000000000000000000000000000");
      return fail(res, 401, "Invalid email or password");
    }
    const candidate = await password(p, user.password.split(":")[0]);
    if (!timingSafeEqual(Buffer.from(candidate), Buffer.from(user.password)))
      return fail(res, 401, "Invalid email or password");
    const token = randomBytes(32).toString("base64url");
    await sessions.insertOne({
      token: hash(token),
      userId: user._id,
      expires: new Date(Date.now() + 86400000),
    });
    res
      .cookie("session", token, { ...cookieOptions, maxAge: 86400000 })
      .json({ user: publicUser(user) });
  });
  app.use("/api", async (req, res, next) => {
    const token =
      req.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("session="))
        ?.slice(8) || "";
    const session = await sessions.findOne({
      token: hash(token),
      expires: { $gt: new Date() },
    });
    const user = session && (await users.findOne({ _id: session.userId }));
    if (!user) return fail(res, 401, "Please sign in");
    req.user = user;
    req.sessionToken = hash(token);
    next();
  });
  app.use("/api", (req, res, next) => {
    if (config.auditEnabled && req.method !== "GET")
      res.on("finish", () => {
        db.collection("audit")
          .insertOne({
            actor: req.user._id,
            role: req.user.role,
            action: req.path,
            method: req.method,
            status: res.statusCode,
            at: new Date(),
            expires: new Date(Date.now() + 365 * 86400000),
          })
          .catch(() => console.error("AUDIT_WRITE_FAILED"));
      });
    if (
      req.method !== "GET" &&
      !req.path.startsWith("/auth/") &&
      !req.path.startsWith("/admin/") &&
      req.path !== "/logout"
    ) {
      if (config.strictProduction && !req.user.emailVerified)
        return fail(res, 403, "Verify your email before using this feature.");
      if (
        config.requireTeacherApproval &&
        req.user.role === "teacher" &&
        !req.user.teacherApproved &&
        !(
          req.user.emailVerified && config.adminEmails?.includes(req.user.email)
        )
      )
        return fail(
          res,
          403,
          "Your teacher account needs administrator approval.",
        );
    }
    next();
  });
  security.protectedRoutes();
  trustedFaceRoutes(app, {
    db,
    provider: config.faceProvider,
    transaction: config.transaction,
    rateStore: config.distributedLimits
      ? new MongoRateStore(db.collection("rateLimits"), "managed-face")
      : undefined,
  });
  biometricRoutes(app, {
    users,
    key: config.biometricKey,
    strictProduction: config.strictProduction,
  });
  app.post("/api/setup", async (req, res) => {
    if (req.user.role !== "student")
      return fail(res, 403, "Student access required");
    if (
      typeof req.body.cameraTested !== "boolean" ||
      typeof req.body.micTested !== "boolean"
    )
      return fail(res, 400, "Device checks must be boolean values");
    const setup = {
      completed: true,
      cameraTested: req.body.cameraTested,
      micTested: req.body.micTested,
      updated: new Date(),
    };
    await users.updateOne({ _id: req.user._id }, { $set: { setup } });
    res.json({ ok: true });
  });
  app.post("/api/logout", async (req, res) => {
    await sessions.deleteOne({ token: req.sessionToken });
    res.clearCookie("session", cookieOptions).json({ ok: true });
  });
  app.get("/api/state", async (req, res) => {
    const teacher = req.user.role === "teacher",
      uid = req.user._id;
    const enrolled = await classes
      .find(teacher ? { teacher: uid } : { members: uid })
      .toArray();
    const out = await Promise.all(
      enrolled.map(async (cl) => {
        const roster = teacher
          ? await users
              .find(
                { _id: { $in: cl.members } },
                { projection: { name: 1, "setup.completed": 1 } },
              )
              .toArray()
          : [];
        const history = await lessons
          .find({ classId: cl._id })
          .sort({ created: -1, _id: -1 })
          .limit(100)
          .toArray();
        const records = await attendance
          .find({
            lesson: { $in: history.map((l) => l._id) },
            ...(!teacher ? { student: uid } : {}),
          })
          .toArray();
        return {
          id: cl._id,
          name: cl.name,
          section: cl.section,
          code: teacher ? cl.code : undefined,
          studentCount: cl.members.length,
          students: roster.map((s) => ({
            id: s._id,
            name: s.name,
            setupCompleted: !!s.setup?.completed,
          })),
          historyLimited: history.length === 100,
          lessons: history.map((l) => ({
            id: l._id,
            created: l.created,
            active: l.active,
          })),
          attendance: records.map((a) => ({
            lesson: a.lesson,
            student: a.student,
            status: a.status,
            evidence: a.evidence || {},
          })),
        };
      }),
    );
    res.json({ user: publicUser(req.user), classes: out });
  });
  app.post("/api/classes", async (req, res) => {
    if (req.user.role !== "teacher")
      return fail(res, 403, "Teacher access required");
    const name = text(req.body.name),
      section = text(req.body.section, 80);
    if (!name)
      return fail(res, 400, "Enter a class name (up to 100 characters).");
    await classes.insertOne({
      _id: id(),
      name,
      section,
      code: randomBytes(5).toString("hex").toUpperCase(),
      teacher: req.user._id,
      members: [],
    });
    res.status(201).json({ ok: true });
  });
  app.post("/api/join", async (req, res) => {
    if (req.user.role !== "student")
      return fail(res, 403, "Student access required");
    const result = await classes.updateOne(
      { code: text(req.body.code, 20).toUpperCase() },
      { $addToSet: { members: req.user._id } },
    );
    if (!result.matchedCount) return fail(res, 404, "Class code not found");
    res.json({ ok: true });
  });
  app.post("/api/lessons", async (req, res) => {
    if (req.user.role !== "teacher" || !validId(req.body.classId))
      return fail(res, 403, "Teacher access required");
    const cl = await classes.findOne({
      _id: req.body.classId,
      teacher: req.user._id,
    });
    if (!cl) return fail(res, 404, "Class not found");
    // A unique partial index guarantees at most one active session per class.
    if (await lessons.findOne({ classId: cl._id, active: true }))
      return fail(
        res,
        409,
        "Close the active session before starting another.",
      );
    await lessons.insertOne({
      _id: id(),
      classId: cl._id,
      created: Math.floor(Date.now() / 1000),
      active: true,
    });
    res.status(201).json({ ok: true });
  });
  app.post(["/api/attendance", "/api/close"], async (req, res) => {
    if (!validId(req.body.lesson)) return fail(res, 400, "Invalid session");
    const lesson = await lessons.findOne({ _id: req.body.lesson });
    if (!lesson) return fail(res, 404, "Session not found");
    const cl = await classes.findOne({ _id: lesson.classId });
    if (!cl) return fail(res, 404, "Class not found");
    const owner = req.user.role === "teacher" && cl.teacher === req.user._id;
    if (req.path === "/api/close") {
      if (!owner) return fail(res, 403, "Teacher access required");
      await lessons.updateOne({ _id: lesson._id }, { $set: { active: false } });
      return res.json({ ok: true });
    }
    const student = owner ? req.body.student : req.user._id;
    if (
      !validId(student) ||
      !cl.members.includes(student) ||
      (!owner && (req.user.role !== "student" || !lesson.active))
    )
      return fail(res, 403, "Check-in not permitted");
    const status = owner ? req.body.status : "pending";
    if (!["present", "late", "absent", "pending"].includes(status))
      return fail(res, 400, "Invalid attendance status");
    if (owner)
      await attendance.updateOne(
        { lesson: lesson._id, student },
        { $set: { status, updated: new Date() } },
        { upsert: true },
      );
    else
      await attendance.insertOne({
        evidence: Object.fromEntries(
          Object.entries(req.user.biometricSignals || {}).filter(
            ([kind, value]) =>
              ["face", "voice"].includes(kind) &&
              value.at &&
              Date.now() - new Date(value.at).getTime() < 300000,
          ),
        ),
        lesson: lesson._id,
        student,
        status,
        updated: new Date(),
      });
    res.json({ ok: true });
  });
  app.use("/api", (req, res) => fail(res, 404, "API route not found"));
  const dist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../frontend/dist",
  );
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
  app.use((err, req, res, next) => {
    if (err.code === 11000)
      return fail(
        res,
        409,
        "Already registered, checked in, or an active session exists.",
      );
    if (err.type === "entity.too.large")
      return fail(res, 413, "Request too large");
    if (err instanceof SyntaxError || err instanceof TypeError)
      return fail(res, 400, "Invalid request");
    if (err.code === "LIMIT_FILE_SIZE" || err.code === "LIMIT_FILE_COUNT")
      return fail(res, 413, "Photo upload is too large.");
    if (err.status && err.status >= 400 && err.status < 500)
      return fail(res, err.status, err.message);
    console.error("Request failed:", err.name);
    return fail(res, 500, "Server error");
  });
  return app;
}
