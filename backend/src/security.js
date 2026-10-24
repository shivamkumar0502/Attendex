import { queueEmail } from "./email-jobs.js";
import { randomBytes, createHash } from "node:crypto";
import nodemailer from "nodemailer";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export class MongoRateStore {
  constructor(collection, prefix) {
    this.collection = collection;
    this.prefix = prefix;
    this.localKeys = false;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  async increment(key) {
    const now = new Date(),
      expired = { $lte: [{ $ifNull: ["$resetAt", new Date(0)] }, now] };
    const update = [
      {
        $set: {
          hits: {
            $cond: [expired, 1, { $add: [{ $ifNull: ["$hits", 0] }, 1] }],
          },
          resetAt: {
            $cond: [expired, new Date(Date.now() + this.windowMs), "$resetAt"],
          },
        },
      },
    ];
    const filter = { _id: this.prefix + ":" + digest(key) };
    let record;
    try {
      record = await this.collection.findOneAndUpdate(filter, update, {
        upsert: true,
        returnDocument: "after",
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      record = await this.collection.findOneAndUpdate(filter, update, {
        returnDocument: "after",
      });
    }
    return { totalHits: record.hits, resetTime: record.resetAt };
  }
  async decrement(key) {
    await this.collection.updateOne(
      { _id: this.prefix + ":" + digest(key), hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }
  async resetKey(key) {
    await this.collection.deleteOne({ _id: this.prefix + ":" + digest(key) });
  }
}
export function mailerFromEnv(env) {
  if (!env.SMTP_HOST || !env.MAIL_FROM) return null;
  const port = Number(env.SMTP_PORT) || 587;
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return {
    verify: () => transport.verify(),
    send: async ({ to, subject, text }) => {
      const result = await transport.sendMail({
        from: env.MAIL_FROM,
        to,
        subject,
        text,
      });
      if (result.rejected?.length || !result.accepted?.length)
        throw Error("SMTP recipient was not accepted");
      return result;
    },
  };
}
export function readiness(config) {
  return {
    mode: config.strictProduction ? "production" : "pilot",
    checks: {
      email: !!(config.mailer && config.mailKey),
      administrators: !!config.adminEmails?.length,
      teacherApproval: !!config.requireTeacherApproval,
      sharedRateLimits: !!config.distributedLimits,
      audit: !!config.auditEnabled,
      managedFaceLiveness: !!config.faceProvider,
      voiceAntiSpoofing: false,
      biometricCalibration: false,
      backupRestoreDrill: false,
      loadAndDeviceAcceptance: false,
    },
    notice:
      "Configuration checks are not a certification. Voice anti-spoofing, biometric calibration and operational acceptance still require validation.",
  };
}
export function validateProduction(config) {
  if (!config.strictProduction) return;
  const state = readiness(config);
  const missing = Object.entries(state.checks)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length)
    throw Error("Production activation blocked: " + missing.join(", "));
}
export function securityRoutes(
  app,
  { db, config, cookieOptions, password, publicUser },
) {
  const users = db.collection("users"),
    sessions = db.collection("sessions"),
    tokens = db.collection("accountTokens");
  function admin(req, res, next) {
    if (!(
      req.user.emailVerified && config.adminEmails?.includes(req.user.email)
    ))
      return res.status(403).json({ error: "Administrator access required" });
    next();
  }
  app.post("/api/auth/reset/request", async (req, res) => {
    if (!config.mailer || !config.mailKey)
      return res
        .status(503)
        .json({ error: "Email delivery has not been configured." });
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    if (email.length > 254)
      return res.status(400).json({ error: "Invalid email" });
    await queueEmail(db, config, { email, kind: "reset" });
    res.status(202).json({
      ok: true,
      message: "If the account exists, recovery instructions will be sent.",
    });
  });
  app.post("/api/auth/reset/complete", async (req, res) => {
    const { token, newPassword } = req.body;
    if (
      typeof token !== "string" ||
      token.length > 100 ||
      typeof newPassword !== "string" ||
      newPassword.length < 12 ||
      newPassword.length > 128
    )
      return res
        .status(400)
        .json({ error: "Use a valid token and a 12–128 character password." });
    const passwordHash = await password(newPassword);
    const match = await tokens.findOneAndDelete({
      token: digest(token),
      kind: "reset",
      expires: { $gt: new Date() },
    });
    if (!match)
      return res
        .status(400)
        .json({ error: "This recovery link has expired or was already used." });
    await users.updateOne(
      { _id: match.userId },
      { $set: { password: passwordHash, passwordChangedAt: new Date() } },
    );
    await sessions.deleteMany({ userId: match.userId });
    res.clearCookie("session", cookieOptions).json({ ok: true });
  });
  app.post("/api/auth/email/complete", async (req, res) => {
    if (typeof req.body.token !== "string" || req.body.token.length > 100)
      return res.status(400).json({ error: "Invalid verification token" });
    const match = await tokens.findOneAndDelete({
      token: digest(req.body.token),
      kind: "verify",
      expires: { $gt: new Date() },
    });
    if (!match)
      return res.status(400).json({
        error: "This verification link has expired or was already used.",
      });
    await users.updateOne(
      { _id: match.userId },
      { $set: { emailVerified: true, emailVerifiedAt: new Date() } },
    );
    res.json({ ok: true });
  });
  return {
    protectedRoutes() {
      app.post("/api/auth/email/request", async (req, res) => {
        if (!config.mailer || !config.mailKey)
          return res
            .status(503)
            .json({ error: "Email delivery has not been configured." });
        if (!req.user.emailVerified)
          await queueEmail(db, config, {
            email: req.user.email,
            kind: "verify",
            userId: req.user._id,
          });
        res.json({ ok: true });
      });
      app.post("/api/auth/sessions/revoke", async (req, res) => {
        await sessions.deleteMany({ userId: req.user._id });
        res.clearCookie("session", cookieOptions).json({ ok: true });
      });
      app.get("/api/account", async (req, res) =>
        res.json({
          user: publicUser(req.user),
          isAdmin: !!(
            req.user.emailVerified &&
            config.adminEmails?.includes(req.user.email)
          ),
          emailDelivery: !!(config.mailer && config.mailKey),
          emailTransport: config.emailTransport || { status: "unchecked" },
          requireEmailVerification: !!config.strictProduction,
          requireTeacherApproval: !!config.requireTeacherApproval,
        }),
      );
      app.get("/api/admin/readiness", admin, (req, res) =>
        res.json(readiness(config)),
      );
      app.get("/api/admin/teachers", admin, async (req, res) =>
        res.json({
          teachers: await users
            .find(
              { role: "teacher", teacherApproved: { $ne: true } },
              { projection: { name: 1, email: 1, emailVerified: 1 } },
            )
            .limit(100)
            .toArray(),
        }),
      );
      app.post("/api/admin/teachers/approve", admin, async (req, res) => {
        if (!/^[a-f0-9]{24}$/.test(req.body.userId || ""))
          return res.status(400).json({ error: "Invalid teacher" });
        const result = await users.updateOne(
          { _id: req.body.userId, role: "teacher", emailVerified: true },
          {
            $set: {
              teacherApproved: true,
              approvedBy: req.user._id,
              approvedAt: new Date(),
            },
          },
        );
        if (!result.matchedCount)
          return res.status(404).json({ error: "Verified teacher not found" });
        res.json({ ok: true });
      });
      app.get("/api/audit", async (req, res) => {
        const query =
          req.user.emailVerified && config.adminEmails?.includes(req.user.email)
            ? {}
            : { actor: req.user._id };
        const before = req.query.before;
        if (before && !Number.isFinite(Date.parse(before)))
          return res.status(400).json({ error: "Invalid cursor" });
        if (before) query.at = { $lt: new Date(before) };
        const entries = await db
          .collection("audit")
          .find(query, { projection: { _id: 0 } })
          .sort({ at: -1 })
          .limit(50)
          .toArray();
        res.json({
          entries,
          nextBefore: entries.length === 50 ? entries.at(-1).at : null,
        });
      });
    },
  };
}
