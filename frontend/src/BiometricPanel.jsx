import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { mediaError } from "./mediaError.js";
export default function BiometricPanel() {
  const [profile, setProfile] = useState(null),
    [kind, setKind] = useState("face"),
    [mode, setMode] = useState("enroll"),
    [consent, setConsent] = useState(false),
    [samples, setSamples] = useState([]),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false),
    [message, setMessage] = useState(""),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  const video = useRef(null),
    stream = useRef(null),
    recorder = useRef(null),
    timer = useRef(null),
    alive = useRef(true),
    generation = useRef(0);
  async function load() {
    try {
      const data = await api("biometrics");
      if (alive.current) setProfile(data);
    } catch (e) {
      if (alive.current) setError(e.message);
    }
  }
  function stop() {
    generation.current++;
    clearTimeout(timer.current);
    if (recorder.current) {
      recorder.current.onstop = null;
      recorder.current.ondataavailable = null;
      if (recorder.current.state === "recording") recorder.current.stop();
      recorder.current = null;
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (alive.current) {
      setActive(false);
      setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
      stop();
    };
  }, []);
  function choose(next) {
    stop();
    setSamples([]);
    setResult(null);
    setMessage("");
    setError("");
    setKind(next);
  }
  async function capture() {
    setError("");
    setResult(null);
    if (!consent)
      return setError(
        "Please read and accept the template storage consent first.",
      );
    if (!navigator.mediaDevices?.getUserMedia)
      return setError(
        "Camera/microphone capture requires HTTPS and a supported browser.",
      );
    setBusy(true);
    const run = ++generation.current;
    try {
      if (kind === "face") {
        if (!stream.current) {
          const media = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: "user",
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
          if (!alive.current || run !== generation.current) {
            media.getTracks().forEach((t) => t.stop());
            return;
          }
          stream.current = media;
          video.current.srcObject = media;
          await video.current.play();
          setActive(true);
          setMessage(
            "Face the camera in good light. Move slightly between enrollment samples.",
          );
          setBusy(false);
          return;
        }
        setMessage("Loading face model and extracting a descriptor…");
        const { faceEmbedding } = await import("./biometrics.js");
        const vector = await faceEmbedding(video.current);
        if (alive.current && run === generation.current) await receive(vector);
      } else {
        if (!window.MediaRecorder)
          throw Error("Audio recording is unavailable in this browser.");
        const media = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        if (!alive.current || run !== generation.current) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const rec = new MediaRecorder(media),
          chunks = [];
        recorder.current = rec;
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        rec.onstop = async () => {
          media.getTracks().forEach((t) => t.stop());
          stream.current = null;
          if (!alive.current || run !== generation.current) return;
          setActive(false);
          setMessage(
            "Extracting a voice embedding. First use downloads an 84 MB model; this can take a while.",
          );
          try {
            const { voiceEmbedding } = await import("./biometrics.js");
            const vector = await voiceEmbedding(
              new Blob(chunks, { type: rec.mimeType }),
            );
            if (alive.current && run === generation.current)
              await receive(vector);
          } catch (e) {
            if (alive.current && run === generation.current) {
              setError(e.message);
              setMessage("");
            }
          } finally {
            if (alive.current && run === generation.current) setBusy(false);
          }
        };
        rec.onerror = () => {
          if (alive.current) {
            setError("Recording failed. Try again.");
            setBusy(false);
          }
          media.getTracks().forEach((t) => t.stop());
        };
        rec.start();
        setActive(true);
        setMessage(
          "Speak naturally for 5 seconds: “Today I am ready to attend my class.”",
        );
        timer.current = setTimeout(() => {
          if (rec.state === "recording") rec.stop();
        }, 5000);
        return;
      }
    } catch (e) {
      if (alive.current && run === generation.current) {
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setActive(false);
        setBusy(false);
        setError(mediaError(e));
        setMessage("");
      }
    } finally {
      if (alive.current && run === generation.current && kind === "face")
        setBusy(false);
    }
  }
  async function receive(vector) {
    if (mode === "enroll") {
      setSamples((previous) => [...previous, vector].slice(0, 3));
      setMessage(
        "Sample captured. Capture another sample with a slightly different pose or phrase.",
      );
    } else {
      setMessage("Comparing against your encrypted enrollment samples…");
      const model =
        kind === "face" ? "face-api-1.7.15" : "ecapa-speaker-v1-a9cb932";
      const answer = await api("biometrics/verify", { kind, vector, model });
      if (alive.current) {
        setResult(answer);
        setMessage(
          "Comparison complete. Submit your check-in within 5 minutes to attach this signal for teacher review.",
        );
        stop();
      }
    }
  }
  async function enroll() {
    setBusy(true);
    setError("");
    try {
      await api("biometrics/enroll", {
        kind,
        samples,
        consent,
        model: kind === "face" ? "face-api-1.7.15" : "ecapa-speaker-v1-a9cb932",
      });
      stop();
      setSamples([]);
      setMessage(
        "Enrollment saved. Switch to compare mode to try a fresh sample.",
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("biometrics/delete", {});
      stop();
      setSamples([]);
      setResult(null);
      setMessage(
        "Your enrolled templates and latest comparison signals were deleted.",
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="biometric-panel">
      <div className="row between">
        <div>
          <span className="eyebrow">OPTIONAL · MODEL-BASED 1:1 COMPARISON</span>
          <h3>My identity lab</h3>
        </div>
        <span className="tag pending">Experimental</span>
      </div>
      <p>
        Enroll your own face/voice samples, then compare a fresh sample against
        your account. A match is a review signal, not proof of identity or a
        final attendance decision.
      </p>
      <div className="enrollment-status">
        <span className="tag">
          Face: {profile?.face ? "enrolled" : "not enrolled"}
        </span>
        <span className="tag">
          Voice: {profile?.voice ? "enrolled" : "not enrolled"}
        </span>
      </div>
      {profile && !profile.enabled ? (
        <p role="status">
          Matching is not configured on this server. Manual check-in remains
          available.
        </p>
      ) : (
        <>
          <label className="consent-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={busy || active}
            />
            <span>
              I agree to store encrypted biometric templates for my attendance
              comparison. Raw recordings/photos stay on my device. I can delete
              my templates below and use manual check-in instead.
            </span>
          </label>
          <div className="row">
            <select
              aria-label="Biometric method"
              value={kind}
              disabled={busy}
              onChange={(e) => choose(e.target.value)}
            >
              <option value="face">Face comparison</option>
              <option value="voice">Voice comparison</option>
            </select>
            <select
              aria-label="Biometric operation"
              value={mode}
              disabled={busy}
              onChange={(e) => {
                stop();
                setMode(e.target.value);
                setSamples([]);
                setResult(null);
                setMessage("");
              }}
            >
              <option value="enroll">Enroll my samples</option>
              <option value="verify">Compare a fresh sample</option>
            </select>
          </div>
          {kind === "face" && (
            <div className="camera-stage">
              <video
                ref={video}
                autoPlay
                muted
                playsInline
                aria-label="Identity camera preview"
                hidden={!active}
              />
              {!active && <div className="empty">Camera is off</div>}
            </div>
          )}
          <div className="row">
            <button
              type="button"
              disabled={
                busy ||
                !profile?.enabled ||
                !consent ||
                (mode === "verify" && !profile?.[kind])
              }
              onClick={capture}
            >
              {busy
                ? kind === "voice" && active
                  ? "Recording…"
                  : "Processing…"
                : kind === "face" && !active
                  ? "Open comparison camera"
                  : mode === "enroll"
                    ? "Capture sample"
                    : "Compare now"}
            </button>
            {mode === "enroll" && (
              <button
                type="button"
                className="ghost"
                disabled={busy || samples.length < 2}
                onClick={enroll}
              >
                Save {samples.length} / 2–3 samples
              </button>
            )}
            {active && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  stop();
                  setBusy(false);
                  setMessage("Capture cancelled.");
                }}
              >
                Cancel capture
              </button>
            )}
          </div>
          <p aria-live="polite">{message}</p>
          {result && (
            <div
              className={
                "comparison-result " +
                (result.result === "match" ? "" : "pending")
              }
            >
              <strong>
                {result.result === "match"
                  ? "Model match signal"
                  : "Needs teacher review"}
              </strong>
              <p>
                {result.metric}: {result.score} · threshold {result.threshold}.
                This score is not an identity probability.
              </p>
            </div>
          )}
          <p className="hint">
            First voice use downloads about 84 MB. Models run in your browser;
            only descriptors are sent to the server. Browser-generated
            descriptors can be tampered with, and replay/liveness protection is
            not implemented. Thresholds are experimental and not calibrated for
            your institution.
          </p>
        </>
      )}
      {(profile?.face || profile?.voice) && (
        <button
          type="button"
          className="textbtn"
          disabled={busy}
          onClick={remove}
        >
          Delete all my biometric templates
        </button>
      )}
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
    </section>
  );
}
