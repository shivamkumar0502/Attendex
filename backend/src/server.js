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
const app = createApp(db, {
  origin: process.env.APP_ORIGIN,
  secureCookies: process.env.COOKIE_SECURE === "1",
  trustProxy: process.env.TRUST_PROXY === "1",
});
const server = app.listen(Number(process.env.PORT) || 8000, "0.0.0.0", () =>
  console.log("Attendex API listening"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(async () => {
      await client.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
