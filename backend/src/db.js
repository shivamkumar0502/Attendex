import { MongoClient } from "mongodb";
export async function connectDatabase(uri, name) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20,
  });
  try {
    await client.connect();
    const db = client.db(name);
    await Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("sessions").createIndex({ token: 1 }, { unique: true }),
      db
        .collection("sessions")
        .createIndex({ expires: 1 }, { expireAfterSeconds: 0 }),
      db.collection("classes").createIndex({ code: 1 }, { unique: true }),
      db.collection("classes").createIndex({ teacher: 1 }),
      db.collection("classes").createIndex({ members: 1 }),
      db.collection("lessons").createIndex({ classId: 1, created: -1 }),
      db
        .collection("lessons")
        .createIndex(
          { classId: 1 },
          { unique: true, partialFilterExpression: { active: true } },
        ),
      db
        .collection("attendance")
        .createIndex({ lesson: 1, student: 1 }, { unique: true }),
    ]);
    return { client, db };
  } catch (e) {
    await client.close();
    throw e;
  }
}
