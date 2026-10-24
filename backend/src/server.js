import { mailKeyFromEnv, processEmailJobs } from "./email-jobs.js";
import { mailerFromEnv, validateProduction } from "./security.js";
import { providerFromEnv, cleanupProviderTemplates } from "./trusted-face.js";
import { connectDatabase } from "./db.js";
import { createApp } from "./app.js";
if (!process.env.MONGODB_URI)
  throw new Error("Set MONGODB_URI in the root .env file (see .env.example).");
if (
  process.env.NODE_ENV === "production" &&
  (!process.env.APP_ORIGIN?.startsWith("https://") ||
    process.env.COOKIE_SECURE !== "1")
)
  throw new Error("Production requires HTTPS APP_ORIGIN and COOKIE_SECURE=1.");
const { client, db } = await connectDatabase(
  process.env.MONGODB_URI,
  process.env.MONGODB_DB || "attendex",
);
const config = {
  strictProduction: process.env.DEPLOYMENT_MODE === "production",
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
  requireTeacherApproval: process.env.REQUIRE_TEACHER_APPROVAL === "1",
  distributedLimits: true,
  auditEnabled: true,
  mailer: mailerFromEnv(process.env),
  mailKey: mailKeyFromEnv(process.env),
  faceProvider: providerFromEnv(process.env),
  transaction: async (work) =>
    client.withSession((session) =>
      session.withTransaction(() => work(session)),
    ),
  origin: process.env.APP_ORIGIN,
  biometricKey: process.env.BIOMETRIC_KEY,
  secureCookies: process.env.COOKIE_SECURE === "1",
  trustProxy: process.env.TRUST_PROXY === "1",
};
validateProduction(config);
const app = createApp(db, config);
const cleanup = setInterval(
  () =>
    cleanupProviderTemplates(db, config.faceProvider).catch(() =>
      console.error("PROVIDER_CLEANUP_FAILED"),
    ),
  120000,
);
cleanup.unref();
let mailWork = null;
const mailWorker = setInterval(() => {
  if (!mailWork)
    mailWork = processEmailJobs(db, config)
      .catch(() => console.error("EMAIL_WORKER_FAILED"))
      .finally(() => {
        mailWork = null;
      });
}, 5000);
mailWorker.unref();
const server = app.listen(Number(process.env.PORT) || 8000, "0.0.0.0", () =>
  console.log("Attendex API listening"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    clearInterval(cleanup);
    clearInterval(mailWorker);
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
