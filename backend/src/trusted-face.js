import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import {
  RekognitionClient,
  CreateCollectionCommand,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  IndexFacesCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  SearchFacesByImageCommand,
} from "@aws-sdk/client-rekognition";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
const validId = (v) => typeof v === "string" && /^[a-f0-9]{24}$/.test(v);
const error = (status, message) =>
  Object.assign(new Error(message), { status });
export function approvedCandidate(matches, allowed) {
  const ranked = [...matches]
      .filter((m) => Number.isFinite(m.similarity))
      .sort((a, b) => b.similarity - a.similarity),
    top = ranked[0];
  if (
    !top ||
    allowed.get(top.faceId) !== top.student ||
    top.similarity < 99 ||
    (ranked[1] && top.similarity - ranked[1].similarity < 3)
  )
    return null;
  return top;
}
export function providerFromEnv(env) {
  if (env.AWS_FACE_ENABLED !== "1") return null;
  if (!env.AWS_REGION || !env.LIVENESS_ROLE_ARN)
    throw Error(
      "AWS face integration requires AWS_REGION and LIVENESS_ROLE_ARN.",
    );
  const client = new RekognitionClient({
      region: env.AWS_REGION,
      maxAttempts: 2,
    }),
    sts = new STSClient({ region: env.AWS_REGION, maxAttempts: 2 });
  const send = (command) =>
    client.send(command, { abortSignal: AbortSignal.timeout(30000) });
  const assume = (command) =>
    sts.send(command, { abortSignal: AbortSignal.timeout(15000) });
  const collection = (id) =>
    (env.FACE_COLLECTION_PREFIX || "attendex") + "-" + id;
  return {
    region: env.AWS_REGION,
    async create() {
      const result = await send(
        new CreateFaceLivenessSessionCommand({
          Settings: { AuditImagesLimit: 0 },
        }),
      );
      if (!result.SessionId) throw error(502, "Liveness session unavailable");
      const assumed = await assume(
        new AssumeRoleCommand({
          RoleArn: env.LIVENESS_ROLE_ARN,
          RoleSessionName: "attendex-liveness",
          DurationSeconds: 900,
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "rekognition:StartFaceLivenessSession",
                Resource: "*",
              },
            ],
          }),
        }),
      );
      const c = assumed.Credentials;
      if (!c) throw error(502, "Temporary streaming credentials unavailable");
      return {
        sessionId: result.SessionId,
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: c.AccessKeyId,
          secretAccessKey: c.SecretAccessKey,
          sessionToken: c.SessionToken,
          expiration: c.Expiration,
        },
      };
    },
    async enroll(sessionId, classId, student) {
      const result = await send(
        new GetFaceLivenessSessionResultsCommand({ SessionId: sessionId }),
      );
      if (
        result.Status !== "SUCCEEDED" ||
        (result.Confidence ?? 0) < 95 ||
        !result.ReferenceImage?.Bytes
      )
        throw error(
          422,
          "Liveness check did not pass. Start a new check or ask your teacher for manual attendance.",
        );
      try {
        await send(
          new CreateCollectionCommand({ CollectionId: collection(classId) }),
        );
      } catch (e) {
        if (e.name !== "ResourceAlreadyExistsException") throw e;
      }
      const indexed = await send(
        new IndexFacesCommand({
          CollectionId: collection(classId),
          Image: { Bytes: result.ReferenceImage.Bytes },
          ExternalImageId: student,
          MaxFaces: 1,
          QualityFilter: "HIGH",
          DetectionAttributes: ["DEFAULT"],
        }),
      );
      const ids =
        indexed.FaceRecords?.map((r) => r.Face?.FaceId).filter(Boolean) || [];
      if (ids.length !== 1)
        throw error(422, "A single usable face could not be enrolled.");
      return { faceIds: ids, livenessScore: result.Confidence };
    },
    async remove(classId, faceIds) {
      if (faceIds.length) {
        const deletion = await send(
          new DeleteFacesCommand({
            CollectionId: collection(classId),
            FaceIds: faceIds,
          }),
        );
        if (deletion.UnsuccessfulFaceDeletions?.length)
          throw error(502, "Provider template deletion remains pending.");
      }
    },
    async search(photo, classId) {
      const original = await sharp(photo, {
        limitInputPixels: 20000000,
      }).metadata();
      if (
        !["jpeg", "png"].includes(original.format) ||
        (original.pages || 1) !== 1
      )
        throw error(400, "Use single-frame JPEG or PNG photos.");
      const clean = await sharp(photo, {
        limitInputPixels: 20000000,
        failOn: "warning",
      })
        .rotate()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
      const meta = await sharp(clean).metadata();
      const found = await send(
        new DetectFacesCommand({
          Image: { Bytes: clean },
          Attributes: ["DEFAULT"],
        }),
      );
      if ((found.FaceDetails?.length || 0) > 20)
        throw error(
          422,
          "Use smaller group photos with at most 20 faces per photo.",
        );
      const results = [];
      for (const face of found.FaceDetails || []) {
        const b = face.BoundingBox;
        if (
          !b ||
          !Number.isFinite(b.Left) ||
          !Number.isFinite(b.Top) ||
          !Number.isFinite(b.Width) ||
          !Number.isFinite(b.Height)
        )
          continue;
        const left = Math.max(0, Math.floor(b.Left * meta.width) - 8),
          top = Math.max(0, Math.floor(b.Top * meta.height) - 8);
        const width = Math.min(
            meta.width - left,
            Math.ceil(b.Width * meta.width) + 16,
          ),
          height = Math.min(
            meta.height - top,
            Math.ceil(b.Height * meta.height) + 16,
          );
        if (width < 40 || height < 40 || (face.Confidence ?? 0) < 95) {
          results.push({ box: b, matches: [], quality: "low" });
          continue;
        }
        const crop = await sharp(clean)
          .extract({ left, top, width, height })
          .jpeg()
          .toBuffer();
        let response;
        try {
          response = await send(
            new SearchFacesByImageCommand({
              CollectionId: collection(classId),
              Image: { Bytes: crop },
              MaxFaces: 2,
              FaceMatchThreshold: 95,
              QualityFilter: "HIGH",
            }),
          );
        } catch (e) {
          if (
            ["InvalidParameterException", "ResourceNotFoundException"].includes(
              e.name,
            )
          ) {
            results.push({ box: b, matches: [] });
            continue;
          }
          throw e;
        }
        results.push({
          box: b,
          matches: (response.FaceMatches || []).map((m) => ({
            faceId: m.Face?.FaceId,
            student: m.Face?.ExternalImageId,
            similarity: m.Similarity || 0,
          })),
        });
      }
      return results;
    },
  };
}
export function trustedFaceRoutes(
  app,
  { db, provider, transaction, rateStore },
) {
  const classes = db.collection("classes"),
    lessons = db.collection("lessons"),
    enrollments = db.collection("faceEnrollments"),
    live = db.collection("livenessSessions"),
    proposals = db.collection("photoProposals");
  const heavyLimiter = rateLimit({
    message: {
      error: "Too many face analysis requests. Please wait a minute.",
    },
    windowMs: 60000,
    limit: 8,
    keyGenerator: (req) => req.user._id,
    ...(rateStore ? { store: rateStore } : {}),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const configured = (req, res, next) =>
    provider
      ? next()
      : res.status(503).json({
          error:
            "Managed face/liveness provider is not configured. Manual attendance remains available.",
        });
  const teacher = async (req, classId) => {
    if (
      !validId(classId) ||
      req.user.role !== "teacher" ||
      !req.user.emailVerified ||
      !req.user.teacherApproved
    )
      throw error(403, "Teacher access required");
    const cl = await classes.findOne({ _id: classId, teacher: req.user._id });
    if (!cl) throw error(404, "Class not found");
    return cl;
  };
  const member = async (req, classId) => {
    if (
      !validId(classId) ||
      req.user.role !== "student" ||
      !req.user.emailVerified
    )
      throw error(403, "Student access required");
    const cl = await classes.findOne({ _id: classId, members: req.user._id });
    if (!cl) throw error(404, "Class not found");
    return cl;
  };
  let photoBusy = false;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 3, parts: 8 },
    fileFilter(req, file, cb) {
      cb(null, ["image/jpeg", "image/png"].includes(file.mimetype));
    },
  }).array("photos", 4);
  app.get("/api/trusted-face/status", async (req, res) =>
    res.json({
      enabled: !!provider,
      provider: provider ? "Amazon Rekognition" : null,
      requiresTeacherApproval: true,
      voiceAntiSpoofing: false,
    }),
  );
  app.post(
    "/api/trusted-face/session",
    configured,
    heavyLimiter,
    async (req, res) => {
      const cl = await member(req, req.body.classId);
      if (req.body.consent !== true)
        throw error(
          400,
          "Explicit consent to stream live video to Amazon Rekognition is required.",
        );
      const previous = await enrollments.findOne({
        classId: cl._id,
        student: req.user._id,
        status: { $ne: "revoked" },
      });
      if (previous)
        throw error(
          409,
          "Revoke your previous enrollment before enrolling again.",
        );
      const session = await provider.create();
      await live.insertOne({
        _id: session.sessionId,
        classId: cl._id,
        student: req.user._id,
        used: false,
        expires: new Date(Date.now() + 180000),
      });
      res.json(session);
    },
  );
  app.post("/api/trusted-face/complete", configured, async (req, res) => {
    if (
      typeof req.body.sessionId !== "string" ||
      req.body.sessionId.length > 100
    )
      throw error(400, "Invalid liveness session");
    const session = await live.findOneAndUpdate(
      {
        _id: req.body.sessionId,
        student: req.user._id,
        used: false,
        expires: { $gt: new Date() },
      },
      { $set: { used: true } },
      { returnDocument: "before" },
    );
    if (!session)
      throw error(
        409,
        "Session expired or already used. Start a new liveness check.",
      );
    await member(req, session.classId);
    const result = await provider.enroll(
      session._id,
      session.classId,
      req.user._id,
    );
    try {
      await enrollments.updateOne(
        {
          classId: session.classId,
          student: req.user._id,
          $or: [{ status: "revoked" }, { status: { $exists: false } }],
        },
        {
          $set: {
            ...result,
            status: "pending",
            consentVersion: "aws-v1",
            enrolledAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (e) {
      await provider.remove(session.classId, result.faceIds).catch(async () => {
        try {
          await db.collection("providerCleanup").insertOne({
            classId: session.classId,
            faceIds: result.faceIds,
            createdAt: new Date(),
          });
        } catch {
          console.error("PROVIDER_ORPHAN_RECONCILIATION_REQUIRED");
        }
      });
      throw e;
    }
    res.json({
      ok: true,
      status: "pending",
      message:
        "Live capture received. Your teacher must approve your enrollment in person.",
    });
  });
  app.get("/api/trusted-face/enrollment", async (req, res) => {
    const classId = String(req.query.classId || "");
    await member(req, classId);
    const item = await enrollments.findOne(
      { classId, student: req.user._id },
      { projection: { faceIds: 0 } },
    );
    res.json({
      enrollment: item
        ? { status: item.status, enrolledAt: item.enrolledAt }
        : null,
    });
  });
  app.post("/api/trusted-face/revoke", configured, async (req, res) => {
    if (!validId(req.body.classId)) throw error(400, "Invalid class");
    const item = await enrollments.findOneAndUpdate(
      { classId: req.body.classId, student: req.user._id },
      { $set: { status: "revoked", revokedAt: new Date() } },
      { returnDocument: "before" },
    );
    if (item?.faceIds?.length) {
      await db.collection("providerCleanup").insertOne({
        classId: req.body.classId,
        faceIds: item.faceIds,
        createdAt: new Date(),
      });
    }
    res.status(202).json({
      ok: true,
      message:
        "Enrollment revoked immediately; provider template deletion is queued.",
    });
  });
  app.get("/api/trusted-face/pending", async (req, res) => {
    const classId = String(req.query.classId || "");
    const cl = await teacher(req, classId);
    const items = await enrollments
      .find(
        { classId, status: "pending", student: { $in: cl.members } },
        { projection: { faceIds: 0 } },
      )
      .limit(100)
      .toArray();
    res.json({
      enrollments: items.map((item) => ({
        student: item.student,
        livenessScore: item.livenessScore,
        enrolledAt: item.enrolledAt,
      })),
    });
  });
  app.post("/api/trusted-face/approve", configured, async (req, res) => {
    const cl = await teacher(req, req.body.classId);
    if (!cl.members.includes(req.body.student) || req.body.witnessed !== true)
      throw error(
        400,
        "Confirm the student identity in person before approval.",
      );
    const result = await enrollments.updateOne(
      { classId: cl._id, student: req.body.student, status: "pending" },
      {
        $set: {
          status: "approved",
          approvedBy: req.user._id,
          approvedAt: new Date(),
        },
      },
    );
    if (!result.matchedCount) throw error(409, "No pending enrollment");
    res.json({ ok: true });
  });
  app.post(
    "/api/trusted-face/photos",
    configured,
    heavyLimiter,
    async (req, res, next) => {
      req.uploadClass = await teacher(req, String(req.query.classId || ""));
      next();
    },
    (req, res, next) => {
      if (photoBusy) {
        res.set("Retry-After", "3");
        return res
          .status(503)
          .json({ error: "Photo processing is busy. Try again shortly." });
      }
      photoBusy = true;
      let released = false;
      req.releasePhotoSlot = () => {
        if (!released) {
          released = true;
          photoBusy = false;
        }
      };
      res.once("finish", req.releasePhotoSlot);
      res.once("close", () => {
        if (!req.processingPhoto) req.releasePhotoSlot();
      });
      next();
    },
    upload,
    async (req, res) => {
      req.processingPhoto = true;
      try {
        const cl = req.uploadClass;
        if (req.body.classId !== cl._id) throw error(400, "Class mismatch");
        if (req.body.consent !== "true")
          throw error(
            400,
            "Confirm permission to process the pictured students before uploading.",
          );
        if (!validId(req.body.lesson))
          throw error(400, "Invalid attendance session");
        const lesson = await lessons.findOne({
          _id: req.body.lesson,
          classId: cl._id,
          active: true,
        });
        if (!lesson) throw error(409, "Start an active class session first.");
        if (!req.files?.length)
          throw error(400, "Upload one to four JPEG or PNG photos.");
        const roster = await enrollments
          .find({
            classId: cl._id,
            status: "approved",
            student: { $in: cl.members },
          })
          .toArray();
        if (!roster.length)
          throw error(
            409,
            "Approve student face enrollments before scanning group photos.",
          );
        const allowed = new Map(
          roster.flatMap((r) => (r.faceIds || []).map((id) => [id, r.student])),
        );
        const candidates = [],
          unknown = [];
        let source = 0;
        for (const file of req.files) {
          source++;
          const faces = await provider.search(file.buffer, cl._id);
          for (const face of faces) {
            const top = approvedCandidate(face.matches, allowed);
            if (!top) {
              unknown.push({
                source,
                box: face.box,
                reason:
                  face.quality === "low"
                    ? "low-quality"
                    : "unknown-or-ambiguous",
              });
              continue;
            }
            candidates.push({
              student: top.student,
              source,
              box: face.box,
              similarity: top.similarity,
            });
          }
        }
        const seen = new Set(),
          duplicates = new Set();
        for (const c of candidates) {
          const key = c.source + ":" + c.student;
          if (seen.has(key)) duplicates.add(key);
          seen.add(key);
        }
        const safe = candidates.filter(
          (c) => !duplicates.has(c.source + ":" + c.student),
        );
        for (const c of candidates.filter((c) =>
          duplicates.has(c.source + ":" + c.student),
        ))
          unknown.push({
            source: c.source,
            box: c.box,
            reason: "duplicate-identity",
          });
        const proposalId = randomBytes(12).toString("hex");
        await proposals.insertOne({
          _id: proposalId,
          teacher: req.user._id,
          classId: cl._id,
          lesson: lesson._id,
          candidates: safe,
          used: false,
          expires: new Date(Date.now() + 3600000),
        });
        res.json({
          proposalId,
          candidates: safe,
          unknown,
          notice:
            "Suggestions only. Review each student before saving. No absent records are inferred.",
        });
      } finally {
        req.releasePhotoSlot?.();
      }
    },
  );
  app.post("/api/trusted-face/confirm", configured, async (req, res) => {
    const cl = await teacher(req, req.body.classId);
    if (!validId(req.body.proposalId)) throw error(400, "Invalid proposal");
    const selections = req.body.selections;
    if (
      !Array.isArray(selections) ||
      !selections.length ||
      selections.length > 500 ||
      selections.some(
        (s) =>
          !cl.members.includes(s.student) ||
          !["present", "late", "absent"].includes(s.status),
      ) ||
      new Set(selections.map((s) => s.student)).size !== selections.length
    )
      throw error(400, "Review a valid, unique set of roster students.");
    if (!transaction)
      throw error(
        503,
        "Transactional database access is required for confirmation.",
      );
    await transaction(async (session) => {
      const options = { session };
      const proposal = await proposals.findOne(
        {
          _id: req.body.proposalId,
          teacher: req.user._id,
          classId: cl._id,
          used: false,
          expires: { $gt: new Date() },
        },
        options,
      );
      if (!proposal) throw error(409, "Proposal expired or already confirmed.");
      if (
        selections.some(
          (s) => !proposal.candidates.some((c) => c.student === s.student),
        )
      )
        throw error(400, "Selected student is not in this proposal.");
      const lesson = await lessons.findOne(
        { _id: proposal.lesson, classId: cl._id, active: true },
        options,
      );
      if (!lesson) throw error(409, "This attendance session is closed.");
      await db.collection("attendance").bulkWrite(
        selections.map((s) => ({
          updateOne: {
            filter: { lesson: proposal.lesson, student: s.student },
            update: {
              $set: {
                status: s.status,
                updated: new Date(),
                reviewedBy: req.user._id,
                "evidence.managedFace": {
                  source: "teacher-reviewed-group-photo",
                  at: new Date(),
                },
              },
            },
            upsert: true,
          },
        })),
        options,
      );
      await proposals.updateOne(
        { _id: proposal._id },
        { $set: { used: true, confirmedAt: new Date() } },
        options,
      );
      await db.collection("audit").insertOne(
        {
          actor: req.user._id,
          action: "group-photo.confirm",
          classId: cl._id,
          lesson: lesson._id,
          count: selections.length,
          at: new Date(),
          expires: new Date(Date.now() + 365 * 86400000),
        },
        options,
      );
    });
    res.json({ ok: true });
  });
}
export async function cleanupProviderTemplates(db, provider) {
  if (!provider) return;
  const items = await db
    .collection("providerCleanup")
    .find({})
    .limit(20)
    .toArray();
  for (const item of items)
    try {
      await provider.remove(item.classId, item.faceIds);
      await db.collection("providerCleanup").deleteOne({ _id: item._id });
    } catch {
      console.error("PROVIDER_TEMPLATE_DELETION_PENDING");
    }
}
