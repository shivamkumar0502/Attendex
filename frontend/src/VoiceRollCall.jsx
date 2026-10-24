import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
export default function VoiceRollCall({
  classroom,
  lesson,
  onRefresh,
  onError,
}) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(-1),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false);
  const generation = useRef(0),
    recognizer = useRef(null);
  function cancel() {
    generation.current++;
    if (recognizer.current) {
      recognizer.current.onresult = null;
      recognizer.current.onerror = null;
      recognizer.current.abort();
      recognizer.current = null;
    }
    window.speechSynthesis?.cancel();
  }
  useEffect(() => () => cancel(), []);
  useEffect(() => {
    cancel();
    setReady(false);
    if (index < 0) return;
    const student = classroom.students[index];
    if (!student) {
      setIndex(-1);
      setMessage("Roll-call complete");
      onRefresh();
      return;
    }
    if (!window.speechSynthesis) {
      setMessage("Voice is unavailable in this browser. Use the register.");
      return;
    }
    const run = generation.current;
    setMessage(`Calling ${student.name}…`);
    const utter = new SpeechSynthesisUtterance(
      `${student.name}. Are you present?`,
    );
    utter.onend = () => {
      if (run !== generation.current) return;
      const Recognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        setMessage(
          `${student.name}: speech capture unavailable. Confirm manually if present.`,
        );
        setReady(true);
        return;
      }
      const recognition = new Recognition();
      recognizer.current = recognition;
      recognition.lang = "en-IN";
      recognition.onresult = (e) => {
        if (run !== generation.current) return;
        recognition.resultReceived = true;
        setMessage(
          `${student.name}: “${e.results[0][0].transcript}”. Review the response.`,
        );
        setReady(true);
      };
      recognition.onerror = () => {
        if (run === generation.current)
          setMessage("Microphone capture failed. Skip or use the register.");
      };
      recognition.onend = () => {
        if (run === generation.current && !recognition.resultReceived)
          setMessage((m) =>
            m.startsWith("Calling")
              ? "No response captured. Skip or mark manually."
              : m,
          );
      };
      try {
        recognition.start();
      } catch {
        setMessage("Speech capture unavailable. Use the register.");
      }
    };
    window.speechSynthesis.speak(utter);
    return cancel;
    // Restart only on explicit navigation through the roster.
  }, [index, round]);
  async function confirm() {
    setSaving(true);
    try {
      await api("attendance", {
        lesson: lesson.id,
        student: classroom.students[index].id,
        status: "present",
      });
      setIndex((i) => i + 1);
    } catch (e) {
      onError(e.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="voice">
      <div className="row between">
        <h3>Voice roll-call</h3>
        <span className="wave" aria-hidden="true">
          ▂ ▅ ▃ ▇ ▂
        </span>
      </div>
      <p>
        Read student names aloud and capture responses. Confirm each response
        yourself; this does not verify the speaker’s identity.
      </p>
      <p className="hint">
        Your browser’s speech provider may process microphone audio.
      </p>
      <div className="row">
        <button
          className="ghost"
          disabled={!classroom.students.length || saving}
          onClick={() => {
            setIndex(0);
            setRound((r) => r + 1);
          }}
        >
          Start roll-call
        </button>
        <button
          className="ghost"
          disabled={index < 0 || saving}
          onClick={() => setIndex((i) => i + 1)}
        >
          Skip student
        </button>
        <button
          className="ghost"
          onClick={() => {
            cancel();
            setIndex(-1);
            setReady(false);
            setMessage("Roll-call stopped");
            onRefresh();
          }}
        >
          Stop
        </button>
      </div>
      <p aria-live="polite">{message}</p>
      {ready && index >= 0 && (
        <button disabled={saving} onClick={confirm}>
          Confirm response as present
        </button>
      )}
    </div>
  );
}
