import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { exportAttendance } from "./api.js";
export function classMetrics(c) {
  const closed = c.lessons.filter((l) => !l.active);
  const confirmed = c.attendance.filter(
    (a) =>
      closed.some((l) => l.id === a.lesson) &&
      ["present", "late"].includes(a.status),
  ).length;
  const expected = closed.length * c.studentCount;
  return {
    closed: closed.length,
    rate: expected ? Math.round((confirmed / expected) * 100) : null,
    pending: c.attendance.filter((a) => a.status === "pending").length,
    unmarked: Math.max(
      0,
      expected -
        c.attendance.filter((a) => closed.some((l) => l.id === a.lesson))
          .length,
    ),
  };
}
export function Insights({ classes }) {
  const summaries = classes.map((c) => ({ c, ...classMetrics(c) }));
  return (
    <section className="insights-grid">
      <article className="card">
        <div className="row between">
          <div>
            <span className="eyebrow">CLASSROOM PULSE</span>
            <h3>Attendance at a glance</h3>
          </div>
          <span className="tag">Closed sessions</span>
        </div>
        {summaries.length ? (
          summaries.map(({ c, rate, closed }) => (
            <div className="pulse-row" key={c.id}>
              <div className="row between">
                <strong>{c.name}</strong>
                <span>{rate === null ? "No data yet" : rate + "%"}</span>
              </div>
              <div className="progress-track">
                <span style={{ width: (rate || 0) + "%" }} />
              </div>
              <small>
                {closed} closed sessions · Present + late / enrolled students
              </small>
            </div>
          ))
        ) : (
          <p>Create your first class to start seeing attendance trends.</p>
        )}
      </article>
      <article className="card review-card">
        <span className="eyebrow">YOUR NEXT STEPS</span>
        <h3>A clear desk. A clear day.</h3>
        <div className="action-item">
          <span>01</span>
          <div>
            <strong>Review student check-ins</strong>
            <p>
              {summaries.reduce((n, c) => n + c.pending, 0)} pending records
              across your classes.
            </p>
          </div>
        </div>
        <div className="action-item">
          <span>02</span>
          <div>
            <strong>Close completed sessions</strong>
            <p>
              Reports use closed sessions so live classes don’t skew your
              numbers.
            </p>
          </div>
        </div>
        <div className="action-item">
          <span>03</span>
          <div>
            <strong>Keep the record complete</strong>
            <p>
              {summaries.reduce((n, c) => n + c.unmarked, 0)} unmarked records
              in closed sessions. Missing records stay unmarked.
            </p>
          </div>
        </div>
      </article>
    </section>
  );
}
export function ShareClass({ classroom, onClose }) {
  const [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false);
  const link = new URL(
    "/?join=" + encodeURIComponent(classroom.code),
    window.location.origin,
  ).href;
  const dialog = useRef(null);
  useEffect(() => {
    let live = true;
    const previous = document.activeElement;
    dialog.current.querySelector("button").focus();
    QRCode.toDataURL(link, {
      width: 260,
      margin: 2,
      color: { dark: "#163e34", light: "#ffffff" },
    })
      .then((v) => {
        if (live) setQr(v);
      })
      .catch(() => {
        if (live) setQr("unavailable");
      });
    return () => {
      live = false;
      previous?.focus();
    };
  }, [link]);
  function keys(e) {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab") {
      const nodes = [...dialog.current.querySelectorAll("button,input")];
      if (e.shiftKey && document.activeElement === nodes[0]) {
        e.preventDefault();
        nodes.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
        e.preventDefault();
        nodes[0].focus();
      }
    }
  }
  return (
    <div className="modal" onKeyDown={keys}>
      <section
        ref={dialog}
        className="card share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
      >
        <div className="row between">
          <h2 id="share-title">A seat for everyone.</h2>
          <button
            className="ghost"
            onClick={onClose}
            aria-label="Close sharing"
          >
            ×
          </button>
        </div>
        <p>
          Invite students to {classroom.name}. They’ll sign in before joining.
        </p>
        {qr && qr !== "unavailable" ? (
          <img
            className="qr-image"
            src={qr}
            alt={"QR code to join " + classroom.name}
          />
        ) : (
          <p>
            {qr === "unavailable"
              ? "QR preview unavailable. Use the invitation link below."
              : "Preparing QR code…"}
          </p>
        )}
        <label htmlFor="share-code">Class code</label>
        <input
          id="share-code"
          value={classroom.code}
          readOnly
          className="code"
        />
        <button
          className="full"
          onClick={() =>
            navigator.clipboard
              .writeText(link)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }
        >
          {copied ? "Link copied ✓" : "Copy invitation link ↗"}
        </button>
        <label htmlFor="share-link">Invitation link</label>
        <input id="share-link" value={link} readOnly />
      </section>
    </div>
  );
}
export function StudentDirectory({ classroom }) {
  const [search, setSearch] = useState("");
  const students = classroom.students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="card directory">
      <span className="eyebrow">PEOPLE, NOT JUST NUMBERS</span>
      <div className="row between">
        <h2>Your students</h2>
        <span className="tag">{classroom.studentCount} enrolled</span>
      </div>
      <label htmlFor="student-search">Search students</label>
      <input
        id="student-search"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="student-grid">
        {students.map((s) => {
          const records = classroom.attendance.filter(
              (a) => a.student === s.id,
            ),
            present = records.filter((a) =>
              ["present", "late"].includes(a.status),
            ).length;
          return (
            <article className="student-tile" key={s.id}>
              <span className="avatar">
                {s.name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")}
              </span>
              <div>
                <strong>{s.name}</strong>
                <p>{present} present / late records</p>
                <small>
                  Device setup: {s.setupCompleted ? "complete" : "pending"}
                </small>
              </div>
            </article>
          );
        })}
      </div>
      {!students.length && (
        <p>
          {search
            ? "No students match that search."
            : "Share the class invitation to welcome your first student."}
        </p>
      )}
    </section>
  );
}
export function DemoWorkspace({ onClose }) {
  const [role, setRole] = useState("teacher"),
    [active, setActive] = useState(true),
    [records, setRecords] = useState([
      { student: "d1", lesson: "demo", status: "present" },
      { student: "d2", lesson: "demo", status: "pending" },
      { student: "d3", lesson: "demo", status: "late" },
    ]);
  const students = [
    { id: "d1", name: "Aarav Sharma" },
    { id: "d2", name: "Ananya Singh" },
    { id: "d3", name: "Kabir Patel" },
    { id: "d4", name: "Diya Mehta" },
  ];
  const c = {
    id: "demo",
    name: "Introduction to AI",
    studentCount: 4,
    students,
    lessons: [{ id: "demo", created: 1761264000, active }],
    attendance: records,
  };
  return (
    <div className="demo-page">
      <header className="row between">
        <span className="brand">attendex.</span>
        <div className="row">
          <span className="pill">Interactive demo · sample data</span>
          <button className="ghost" onClick={onClose}>
            Exit demo ↗
          </button>
        </div>
      </header>
      <div className="demo-intro">
        <span className="eyebrow">TAKE A LOOK AROUND</span>
        <h1>A classroom, without the paperwork.</h1>
        <p>
          Try a teacher review or a student check-in. This sandbox makes no API
          calls and changes no real records.
        </p>
        <div className="segmented">
          <button
            className={role === "teacher" ? "active" : ""}
            onClick={() => setRole("teacher")}
          >
            Teacher workspace
          </button>
          <button
            className={role === "student" ? "active" : ""}
            onClick={() => setRole("student")}
          >
            Student workspace
          </button>
        </div>
      </div>
      <section className="insights-grid">
        <article className="card">
          <div className="row between">
            <h2>Introduction to AI</h2>
            <span className={"tag " + (!active ? "pending" : "")}>
              {active ? "Session open" : "Session closed"}
            </span>
          </div>
          <p>CSE · Year 2 · Section A · 4 sample students</p>
          {role === "teacher" ? (
            <>
              <div className="row">
                <button onClick={() => setActive((a) => !a)}>
                  {active ? "Close demo session" : "Open demo session"}
                </button>
                <button
                  className="ghost"
                  onClick={() => exportAttendance(c, { role: "teacher" })}
                >
                  Export sample CSV ↓
                </button>
              </div>
              <div className="roster">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Review status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>
                          <select
                            aria-label={"Demo attendance for " + s.name}
                            value={
                              records.find((a) => a.student === s.id)?.status ||
                              "unmarked"
                            }
                            onChange={(e) =>
                              setRecords((r) => [
                                ...r.filter((a) => a.student !== s.id),
                                {
                                  lesson: "demo",
                                  student: s.id,
                                  status: e.target.value,
                                },
                              ])
                            }
                          >
                            {[
                              "unmarked",
                              "pending",
                              "present",
                              "late",
                              "absent",
                            ].map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="voice">
              <h3>Welcome, Diya.</h3>
              <p>
                {records.find((a) => a.student === "d4")
                  ? "Your check-in is in the sample register. Switch to the teacher view to review it."
                  : "Submit a sample check-in, then switch to the teacher view."}
              </p>
              <button
                disabled={!active || records.some((a) => a.student === "d4")}
                onClick={() =>
                  setRecords((r) => [
                    ...r,
                    { lesson: "demo", student: "d4", status: "pending" },
                  ])
                }
              >
                Check in to demo session
              </button>
            </div>
          )}
        </article>
        <article className="card">
          <span className="eyebrow">BUILT TO BE EXPLAINED</span>
          <h2>What’s under the hood?</h2>
          {[
            [
              "React + Vite",
              "Responsive role-based workspaces and accessible device setup.",
            ],
            [
              "Node.js + Express",
              "Authenticated APIs, scoped class access and reviewed check-ins.",
            ],
            [
              "MongoDB",
              "Persistent sessions, TTL cleanup and uniqueness constraints.",
            ],
          ].map(([a, b]) => (
            <div className="action-item" key={a}>
              <span>↗</span>
              <div>
                <strong>{a}</strong>
                <p>{b}</p>
              </div>
            </div>
          ))}
          <p className="hint">
            No biometric identity claim is made by this demo. Camera/mic checks
            and voice roll-call are separate from identity verification.
          </p>
        </article>
      </section>
    </div>
  );
}
