// Encrypted logical export for a maintenance window. Prefer managed Atlas snapshots for point-in-time recovery.
import { MongoClient, BSON } from "mongodb";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createGzip, createGunzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { open, appendFile, mkdtemp, rm, stat, chmod } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
const collections = ["users", "classes", "lessons", "attendance", "audit"];
const magic = Buffer.from("ATTENDEXBKP1");
const [mode, file] = process.argv.slice(2);
if (!["export", "restore"].includes(mode) || !file)
  throw Error(
    "Usage: node --env-file-if-exists=.env scripts/backup.mjs export|restore /absolute/file.adx",
  );
if (
  !process.env.MONGODB_URI ||
  !process.env.MONGODB_DB ||
  !/^[a-f0-9]{64}$/i.test(process.env.BACKUP_KEY || "")
)
  throw Error(
    "Set MONGODB_URI, explicit MONGODB_DB and a separate 64-hex BACKUP_KEY.",
  );
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
await client.connect();
const db = client.db(process.env.MONGODB_DB),
  key = Buffer.from(process.env.BACKUP_KEY, "hex");
try {
  if (mode === "export") {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv),
      handle = await open(file, "wx", 0o600);
    await handle.write(Buffer.concat([magic, iv]));
    await handle.close();
    async function* rows() {
      yield JSON.stringify({
        version: 1,
        collections,
        createdAt: new Date().toISOString(),
      }) + "\n";
      for (const collection of collections)
        for await (const doc of db.collection(collection).find({}))
          yield JSON.stringify({
            collection,
            document: BSON.EJSON.stringify(doc),
          }) + "\n";
    }
    await pipeline(
      Readable.from(rows()),
      createGzip(),
      cipher,
      createWriteStream(file, { flags: "a", mode: 0o600 }),
    );
    await appendFile(file, cipher.getAuthTag());
    console.log(
      "Encrypted export complete. Store BACKUP_KEY separately and verify a restore in an isolated database.",
    );
  } else {
    if (process.env.RESTORE_CONFIRM !== "RESTORE_EMPTY_DATABASE")
      throw Error(
        "Restore requires RESTORE_CONFIRM=RESTORE_EMPTY_DATABASE and a new isolated database.",
      );
    const existing = await db.listCollections().toArray();
    for (const item of existing)
      if (await db.collection(item.name).findOne({}))
        throw Error("Refusing to overwrite a non-empty database.");
    const size = (await stat(file)).size,
      header = Buffer.alloc(magic.length + 12),
      tag = Buffer.alloc(16),
      handle = await open(file, "r");
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, 16, size - 16);
    await handle.close();
    if (!header.subarray(0, magic.length).equals(magic))
      throw Error("Invalid backup format");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(magic.length),
    );
    decipher.setAuthTag(tag);
    const temp = await mkdtemp(join(tmpdir(), "attendex-restore-"));
    await chmod(temp, 0o700);
    const plaintext = join(temp, "verified.jsonl");
    try {
      await pipeline(
        createReadStream(file, { start: header.length, end: size - 17 }),
        decipher,
        createGunzip(),
        createWriteStream(plaintext, { mode: 0o600 }),
      );
      let first = true,
        count = 0;
      for await (const line of createInterface({
        input: createReadStream(plaintext),
        crlfDelay: Infinity,
      })) {
        const row = JSON.parse(line);
        if (first) {
          first = false;
          if (row.version !== 1) throw Error("Unsupported archive version");
          continue;
        }
        if (
          !collections.includes(row.collection) ||
          typeof row.document !== "string"
        )
          throw Error("Invalid export record");
        const doc = BSON.EJSON.parse(row.document);
        if (!doc || typeof doc !== "object" || !doc._id)
          throw Error("Invalid document");
        await db.collection(row.collection).insertOne(doc);
        count++;
      }
      console.log(
        "Restored " +
          count +
          " documents to the empty target. Sessions and managed face enrollments are not restored. Recreate indexes before use.",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
} finally {
  await client.close();
}
