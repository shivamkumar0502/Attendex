import { createHash, createHmac, randomBytes } from "node:crypto";
import { seal, unseal } from "./biometrics.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function mailKeyFromEnv(env) {
  if (/^[a-f0-9]{64}$/i.test(env.ACCOUNT_MAIL_KEY || ""))
    return env.ACCOUNT_MAIL_KEY;
  if (/^[a-f0-9]{64}$/i.test(env.BIOMETRIC_KEY || ""))
    return createHmac("sha256", Buffer.from(env.BIOMETRIC_KEY, "hex"))
      .update("attendex-mail-outbox-v1")
      .digest("hex");
  return null;
}
export async function queueEmail(db, config, { email, kind, userId }) {
  if (!config.mailer || !config.mailKey)
    throw Object.assign(Error("Email delivery has not been configured."), {
      status: 503,
    });
  const now = new Date();
  const id = digest(email + ":" + kind + ":" + Math.floor(Date.now() / 60000));
  try {
    await db
      .collection("mailJobs")
      .insertOne({
        _id: id,
        sealed: seal({ email, kind, userId }, config.mailKey),
        status: "queued",
        attempts: 0,
        nextAttempt: now,
        createdAt: now,
        expires: new Date(Date.now() + 1800000),
      });
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}
export async function processEmailJobs(db, config, max = 5) {
  if (!config.mailer || !config.mailKey) return;
  const jobs = db.collection("mailJobs");
  for (let i = 0; i < max; i++) {
    const now = new Date();
    const job = await jobs.findOneAndUpdate(
      {
        expires: { $gt: now },
        $or: [
          { status: "queued", nextAttempt: { $lte: now } },
          { status: "processing", leaseUntil: { $lt: now } },
        ],
      },
      {
        $set: {
          status: "processing",
          leaseUntil: new Date(Date.now() + 120000),
        },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    if (!job) return;
    try {
      let body = unseal(job.sealed, config.mailKey);
      if (!body.message) {
        const user = await db
          .collection("users")
          .findOne(body.userId ? { _id: body.userId } : { email: body.email });
        if (!user) {
          await jobs.deleteOne({ _id: job._id });
          continue;
        }
        const token = randomBytes(32).toString("base64url"),
          kind = body.kind === "verify" ? "verify" : "reset";
        await db
          .collection("accountTokens")
          .deleteMany({ userId: user._id, kind });
        await db
          .collection("accountTokens")
          .insertOne({
            token: digest(token),
            userId: user._id,
            kind,
            expires: new Date(
              Date.now() + (kind === "verify" ? 86400000 : 1800000),
            ),
          });
        const url = new URL(config.origin);
        url.hash = kind + "=" + token;
        body = {
          message: {
            to: user.email,
            subject:
              kind === "verify"
                ? "Verify your Attendex email"
                : "Reset your Attendex password",
            text: `${kind === "verify" ? "Verify your email" : "Reset your password"} using this single-use link:\n${url.href}\nIf you did not request this, ignore this email.`,
          },
        };
        await jobs.updateOne(
          { _id: job._id },
          { $set: { sealed: seal(body, config.mailKey) } },
        );
      }
      await config.mailer.send(body.message);
      await jobs.deleteOne({ _id: job._id });
    } catch {
      const attempts = (job.attempts || 0) + 1;
      await jobs.updateOne(
        { _id: job._id },
        {
          $set: {
            status: attempts >= 5 ? "failed" : "queued",
            attempts,
            nextAttempt: new Date(
              Date.now() + Math.min(600000, 30000 * 2 ** attempts),
            ),
          },
          $unset: { leaseUntil: "" },
        },
      );
      console.error("EMAIL_JOB_FAILED");
    }
  }
}
