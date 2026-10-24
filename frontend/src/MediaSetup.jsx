import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
export function mediaError(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name))
    return "Permission denied. Allow camera/microphone access in your browser site settings, then try again.";
  if (error?.name === "NotFoundError")
    return "No compatible camera or microphone was found. Connect a device or continue without it.";
  if (error?.name === "NotReadableError")
    return "This device is busy. Close other camera/microphone apps and try again.";
  return (
    error?.message ||
    "Unable to access this device. Try another browser or use manual attendance."
  );
}
export function PhotoCapture({ classroom = false, onCaptured = () => {} }) {
  const video = useRef(null),
    stream = useRef(null),
    generation = useRef(0),
    mounted = useRef(true),
    [active, setActive] = useState(false),
    [pending, setPending] = useState(false),
    [photo, setPhoto] = useState(""),
    [error, setError] = useState(""),
    [facing, setFacing] = useState(classroom ? "environment" : "user");
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setPending(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function open() {
    stop();
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Camera access needs HTTPS and a supported browser. You can continue without a camera.",
      );
      return;
    }
    const run = generation.current;
    setPending(true);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!mounted.current || run !== generation.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = next;
      video.current.srcObject = next;
      await video.current.play();
      if (mounted.current && run === generation.current) setActive(true);
    } catch (e) {
      if (mounted.current && run === generation.current) {
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setError(mediaError(e));
      }
    } finally {
      if (mounted.current && run === generation.current) setPending(false);
    }
  }
  function capture() {
    const v = video.current;
    if (!v?.videoWidth) {
      setError("Wait for the camera preview before taking a photo.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d").drawImage(v, 0, 0);
    setPhoto(canvas.toDataURL("image/jpeg", 0.85));
    onCaptured();
    stop();
  }
  return (
    <section className="media-card">
      <div className="row between">
        <h3>{classroom ? "Classroom photo" : "Camera check"}</h3>
        <span className="pill">
          {classroom ? "Teacher workspace" : "Step 1"}
        </span>
      </div>
      <p>
        {classroom
          ? "Take a photo for your own classroom reference. Confirm attendance using the register below."
          : "Check your camera and take a preview photo before joining your classroom."}
      </p>
      <div className="camera-stage">
        <video
          ref={video}
          autoPlay
          muted
          playsInline
          hidden={!active && !pending}
          aria-label="Camera preview"
        />
        {!active &&
          !pending &&
          (photo ? (
            <img
              src={photo}
              alt={
                classroom
                  ? "Captured classroom preview"
                  : "Your camera test preview"
              }
            />
          ) : (
            <div className="empty">
              <span className="symbol" aria-hidden="true">
                ◎
              </span>
              <span>Camera is off</span>
            </div>
          ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="ghost"
          disabled={pending}
          onClick={open}
        >
          {pending
            ? "Opening camera…"
            : photo
              ? "Retake photo"
              : classroom
                ? "Take classroom photo"
                : "Open camera"}
        </button>
        {active && (
          <button type="button" onClick={capture}>
            Capture photo
          </button>
        )}
        {(active || pending) && (
          <button type="button" className="ghost" onClick={stop}>
            Close camera
          </button>
        )}
        {photo && (
          <>
            <a
              className="download-link"
              href={photo}
              download={
                classroom
                  ? "attendex-classroom.jpg"
                  : "attendex-camera-test.jpg"
              }
            >
              Download photo ↓
            </a>
            <button
              className="textbtn"
              type="button"
              onClick={() => setPhoto("")}
            >
              Delete preview
            </button>
          </>
        )}
      </div>
      <label className="hint">
        Camera direction
        <select
          value={facing}
          onChange={(e) => {
            stop();
            setFacing(e.target.value);
          }}
        >
          <option value="user">Front camera</option>
          <option value="environment">Rear camera</option>
        </select>
      </label>
      <p className="hint">
        Photos stay in this tab until deleted or you leave this screen. They are
        not uploaded, saved to your account, or used to identify anyone.
      </p>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
    </section>
  );
}
export function MicrophoneCheck({ onTested = () => {} }) {
  const stream = useRef(null),
    recorder = useRef(null),
    chunks = useRef([]),
    timer = useRef(null),
    mounted = useRef(true),
    generation = useRef(0),
    url = useRef(""),
    [recording, setRecording] = useState(false),
    [pending, setPending] = useState(false),
    [audio, setAudio] = useState(""),
    [error, setError] = useState("");
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    clearTimeout(timer.current);
    setRecording(false);
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      clearTimeout(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        recorder.current.ondataavailable = null;
        if (recorder.current.state === "recording") recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "Audio recording is unavailable in this browser. You can continue and use manual check-in.",
      );
      return;
    }
    const run = ++generation.current;
    setPending(true);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      if (!mounted.current || run !== generation.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = next;
      const rec = new MediaRecorder(next);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        next.getTracks().forEach((t) => t.stop());
        if (!mounted.current || run !== generation.current) return;
        const blob = new Blob(chunks.current, {
          type: rec.mimeType || "audio/webm",
        });
        if (!blob.size) {
          setError("No audio was recorded. Please try again.");
          return;
        }
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob);
        setAudio(url.current);
        setRecording(false);
        onTested();
      };
      rec.start();
      setRecording(true);
      timer.current = setTimeout(stop, 10000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current) setError(mediaError(e));
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  return (
    <section className="media-card">
      <div className="row between">
        <h3>Microphone check</h3>
        <span className="pill">Step 2</span>
      </div>
      <p>
        Record a short sample, such as “Hello, I’m ready for class,” then play
        it back to check your microphone.
      </p>
      <div className="voice">
        <span className="wave" aria-hidden="true">
          ▂ ▅ ▃ ▇ ▂
        </span>
        <p aria-live="polite">
          {recording
            ? "Recording… stops automatically after 10 seconds."
            : "Microphone is off until you start recording."}
        </p>
        {audio && (
          <audio controls src={audio} aria-label="Microphone test playback" />
        )}
      </div>
      <div className="row">
        {recording ? (
          <button type="button" onClick={stop}>
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            className="ghost"
            disabled={pending}
            onClick={start}
          >
            {pending
              ? "Opening microphone…"
              : audio
                ? "Record again"
                : "Test microphone"}
          </button>
        )}
        {audio && (
          <button
            type="button"
            className="textbtn"
            onClick={() => {
              URL.revokeObjectURL(url.current);
              url.current = "";
              setAudio("");
            }}
          >
            Delete recording
          </button>
        )}
      </div>
      <p className="hint">
        This is a device test, not voice identity enrollment. Audio stays in
        this tab and is not uploaded or saved to your account.
      </p>
      {error && (
        <p className="media-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
export default function StudentSetup({ user, onDone, onLogout }) {
  const [camera, setCamera] = useState(!!user.setup?.cameraTested),
    [mic, setMic] = useState(!!user.setup?.micTested),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await api("setup", { cameraTested: camera, micTested: mic });
      await onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup-page">
      <header className="row between">
        <span className="brand">attendex.</span>
        <button className="ghost" onClick={onLogout}>
          Sign out
        </button>
      </header>
      <span className="pill">Welcome, {user.name.split(" ")[0]}</span>
      <h1>Let’s get you classroom-ready.</h1>
      <p>
        Check your camera and microphone once. You can skip either check and
        still join classes and submit attendance.
      </p>
      <div className="setup-progress">
        <span className={camera ? "tag" : "tag pending"}>
          {camera ? "✓ Camera checked" : "1 · Camera check"}
        </span>
        <span className={mic ? "tag" : "tag pending"}>
          {mic ? "✓ Microphone checked" : "2 · Microphone check"}
        </span>
      </div>
      <div className="setup-grid">
        <PhotoCapture onCaptured={() => setCamera(true)} />
        <MicrophoneCheck onTested={() => setMic(true)} />
      </div>
      <div className="card row between">
        <p>
          Only your setup completion and device-check flags are saved to your
          account.
        </p>
        <button disabled={busy} onClick={finish}>
          {busy
            ? "Saving…"
            : camera && mic
              ? "Finish setup →"
              : "Continue without remaining checks →"}
        </button>
      </div>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
    </main>
  );
}
