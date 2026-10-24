import React, { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./api.js";
const LivenessCheck = lazy(() => import("./LivenessCheck.jsx"));
export function TrustedFaceEnrollment({ classroom }) {
  const [capability, setCapability] = useState(null),
    [enrollment, setEnrollment] = useState(null),
    [consent, setConsent] = useState(false),
    [session, setSession] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    try {
      const status = await api("trusted-face/status");
      setCapability(status);
      if (status.enabled)
        setEnrollment(
          (await api("trusted-face/enrollment?classId=" + classroom.id))
            .enrollment,
        );
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [classroom.id]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      setSession(
        await api("trusted-face/session", { classId: classroom.id, consent }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    try {
      await api("trusted-face/complete", { sessionId: session.sessionId });
      setSession(null);
      setMessage(
        "Live capture received. Your teacher must approve your enrollment in person.",
      );
      await load();
    } catch (e) {
      setSession(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    try {
      const result = await api("trusted-face/revoke", {
        classId: classroom.id,
      });
      setMessage(result.message);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="media-card">
      <h3>Managed face enrollment</h3>
      <p>
        Complete a provider-backed liveness check for this class, then ask your
        teacher to confirm your identity in person.
      </p>
      {capability && !capability.enabled ? (
        <p className="hint">
          The managed liveness provider is not configured. Use manual check-in;
          a camera test is not a liveness check.
        </p>
      ) : (
        capability && (
          <>
            <span className="tag">{enrollment?.status || "Not enrolled"}</span>
            {(!enrollment || enrollment.status === "revoked") && !session && (
              <>
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I agree to stream live video to Amazon Rekognition for a
                    liveness check and store a class-specific face template
                    there until I revoke it. My teacher must approve enrollment.
                  </span>
                </label>
                <button disabled={!consent || busy} onClick={start}>
                  Start live face check
                </button>
              </>
            )}
            {session && (
              <Suspense fallback={<p>Loading the liveness check…</p>}>
                <LivenessCheck
                  session={session}
                  onComplete={finish}
                  onError={() => {
                    setSession(null);
                    setError(
                      "Liveness check failed. Start a new check or use manual attendance.",
                    );
                  }}
                />
              </Suspense>
            )}
            {enrollment && enrollment.status !== "revoked" && (
              <button className="textbtn" disabled={busy} onClick={revoke}>
                Revoke enrollment and request provider deletion
              </button>
            )}
          </>
        )
      )}
      <p role="status">{message}</p>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
    </section>
  );
}
export function GroupPhotoReview({ classroom, lesson, onRefresh }) {
  const [capability, setCapability] = useState(null),
    [pending, setPending] = useState([]),
    [files, setFiles] = useState([]),
    [consent, setConsent] = useState(false),
    [proposal, setProposal] = useState(null),
    [selected, setSelected] = useState({}),
    [witnessed, setWitnessed] = useState({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    try {
      const status = await api("trusted-face/status");
      setCapability(status);
      if (status.enabled)
        setPending(
          (await api("trusted-face/pending?classId=" + classroom.id))
            .enrollments,
        );
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    setProposal(null);
    setSelected({});
    setFiles([]);
  }, [classroom.id, lesson?.id]);
  async function approve(student) {
    setBusy(true);
    try {
      await api("trusted-face/approve", {
        classId: classroom.id,
        student,
        witnessed: !!witnessed[student],
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function scan() {
    setBusy(true);
    setError("");
    setProposal(null);
    try {
      if (
        !consent ||
        !files.length ||
        files.length > 4 ||
        files.some((f) => f.size > 5 * 1024 * 1024)
      )
        throw Error(
          "Choose 1–4 JPEG/PNG files up to 5 MB each and confirm permission.",
        );
      const form = new FormData();
      form.append("classId", classroom.id);
      form.append("lesson", lesson.id);
      form.append("consent", "true");
      files.forEach((f) => form.append("photos", f));
      const r = await fetch(
        "/api/trusted-face/photos?classId=" + encodeURIComponent(classroom.id),
        {
          method: "POST",
          credentials: "same-origin",
          body: form,
        },
      );
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Photo analysis failed");
      setProposal(data);
      setSelected({});
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api("trusted-face/confirm", {
        classId: classroom.id,
        proposalId: proposal.proposalId,
        selections: Object.entries(selected)
          .filter(([, v]) => v)
          .map(([student]) => ({ student, status: "present" })),
      });
      setProposal(null);
      setMessage("Reviewed attendance saved. No absent records were inferred.");
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const rows = proposal
    ? Array.from(
        new Map(proposal.candidates.map((c) => [c.student, c])).values(),
      )
    : [];
  return (
    <section className="media-card">
      <h3>Group-photo attendance review</h3>
      {capability && !capability.enabled ? (
        <p className="hint">
          Managed face matching/liveness is not configured. Photos do not
          currently generate attendance suggestions.
        </p>
      ) : (
        capability && (
          <>
            <p>
              Only teacher-approved live enrollments from this class are
              searched. Unknown, low-quality and ambiguous faces remain
              unresolved.
            </p>
            {pending.map((item) => (
              <div className="person" key={item.student}>
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={!!witnessed[item.student]}
                    onChange={(e) =>
                      setWitnessed((s) => ({
                        ...s,
                        [item.student]: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    I confirmed{" "}
                    {classroom.students.find((s) => s.id === item.student)
                      ?.name || "this student"}{" "}
                    in person.
                  </span>
                </label>
                <button
                  disabled={busy || !witnessed[item.student]}
                  onClick={() => approve(item.student)}
                >
                  Approve enrollment
                </button>
              </div>
            ))}
            {lesson ? (
              <>
                <label htmlFor={"group-photos-" + classroom.id}>
                  Classroom photos · JPEG/PNG · max 4 × 5 MB
                </label>
                <input
                  id={"group-photos-" + classroom.id}
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
                <label className="consent-row">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I have authorization from the pictured students to send
                    these classroom photos to Amazon Rekognition for attendance
                    suggestions.
                  </span>
                </label>
                <button
                  disabled={busy || !consent || !files.length}
                  onClick={scan}
                >
                  {busy ? "Processing…" : "Analyze photos for review"}
                </button>
                {proposal && (
                  <>
                    <p>
                      {proposal.unknown.length} face(s) unresolved. Review each
                      suggested student before selecting them; similarity is not
                      an identity probability.
                    </p>
                    {rows.map((row) => (
                      <label className="consent-row" key={row.student}>
                        <input
                          type="checkbox"
                          checked={!!selected[row.student]}
                          onChange={(e) =>
                            setSelected((s) => ({
                              ...s,
                              [row.student]: e.target.checked,
                            }))
                          }
                        />
                        <span>
                          {classroom.students.find((s) => s.id === row.student)
                            ?.name || "Student"}{" "}
                          · similarity {row.similarity.toFixed(1)} · photo{" "}
                          {row.source}
                        </span>
                      </label>
                    ))}
                    <button
                      disabled={busy || !Object.values(selected).some(Boolean)}
                      onClick={confirm}
                    >
                      Confirm selected students as present
                    </button>
                  </>
                )}
              </>
            ) : (
              <p>Start an attendance session to analyze photos.</p>
            )}
          </>
        )
      )}
      <p role="status">{message}</p>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
    </section>
  );
}
