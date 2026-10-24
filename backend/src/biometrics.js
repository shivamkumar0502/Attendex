import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export const models = {
  face: "face-api-1.7.15",
  voice: "ecapa-speaker-v1-a9cb932",
};
export function validVector(v, kind) {
  return (
    Array.isArray(v) &&
    v.length === (kind === "face" ? 128 : 192) &&
    v.every(
      (x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 1.01,
    ) &&
    Math.abs(Math.hypot(...v) - 1) < 0.05
  );
}
export function seal(value, key) {
  if (!/^[a-f0-9]{64}$/i.test(key || ""))
    throw Error("Biometric encryption is not configured");
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}
export function unseal(value, key) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(value.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
export function compare(vector, samples, kind) {
  const scores = samples.map((sample) =>
    kind === "face"
      ? Math.hypot(...vector.map((v, i) => v - sample[i]))
      : vector.reduce((sum, v, i) => sum + v * sample[i], 0) /
        (Math.hypot(...vector) * Math.hypot(...sample)),
  );
  const score = kind === "face" ? Math.min(...scores) : Math.max(...scores),
    threshold = kind === "face" ? 0.5 : 0.65;
  return {
    result: (kind === "face" ? score <= threshold : score >= threshold)
      ? "match"
      : "review",
    score: Math.round(score * 10000) / 10000,
    threshold,
    metric: kind === "face" ? "Euclidean distance" : "Cosine similarity",
    model: models[kind],
  };
}
export function biometricRoutes(app, { users, key }) {
  const enabled = /^[a-f0-9]{64}$/i.test(key || "");
  app.get("/api/biometrics", async (req, res) =>
    res.json({
      enabled,
      face: !!req.user.biometrics?.face,
      voice: !!req.user.biometrics?.voice,
      experimental: true,
    }),
  );
  app.post("/api/biometrics/delete", async (req, res) => {
    await users.updateOne(
      { _id: req.user._id },
      { $unset: { biometrics: "", biometricSignals: "" } },
    );
    res.json({ ok: true });
  });
  app.post("/api/biometrics/enroll", async (req, res) => {
    if (req.user.role !== "student")
      return res.status(403).json({ error: "Student access required" });
    if (!enabled)
      return res.status(503).json({
        error: "Biometric matching is not configured on this server.",
      });
    const { kind, samples, consent, model } = req.body;
    if (
      !Object.hasOwn(models, kind) ||
      model !== models[kind] ||
      consent !== true ||
      !Array.isArray(samples) ||
      samples.length < 2 ||
      samples.length > 3 ||
      !samples.every((v) => validVector(v, kind))
    )
      return res.status(400).json({
        error: "Provide consent and two or three valid model samples.",
      });
    await users.updateOne(
      { _id: req.user._id },
      {
        $set: {
          ["biometrics." + kind]: {
            sealed: seal(samples, key),
            model,
            consentedAt: new Date(),
            consentVersion: "v1",
          },
        },
        $unset: { ["biometricSignals." + kind]: "" },
      },
    );
    res.json({ ok: true });
  });
  app.post("/api/biometrics/verify", async (req, res) => {
    if (req.user.role !== "student")
      return res.status(403).json({ error: "Student access required" });
    if (!enabled)
      return res.status(503).json({
        error: "Biometric matching is not configured on this server.",
      });
    const { kind, vector, model } = req.body;
    if (
      !Object.hasOwn(models, kind) ||
      model !== models[kind] ||
      !validVector(vector, kind)
    )
      return res.status(400).json({ error: "Invalid model sample" });
    const profile = req.user.biometrics?.[kind];
    if (!profile || profile.model !== model)
      return res.status(409).json({ error: "Enroll this model first." });
    const result = compare(vector, unseal(profile.sealed, key), kind);
    await users.updateOne(
      { _id: req.user._id },
      { $set: { ["biometricSignals." + kind]: { ...result, at: new Date() } } },
    );
    res.json({
      ...result,
      experimental: true,
      notice: "Comparison signal only. Teacher review is still required.",
    });
  });
}
