import AccountSecurity, { Recovery } from "./AccountSecurity.jsx";
import { TrustedFaceEnrollment, GroupPhotoReview } from "./TrustedFace.jsx";
import BiometricPanel from "./BiometricPanel.jsx";
import React, { useEffect, useRef, useState } from "react";
import { api, exportAttendance } from "./api.js";
import VoiceRollCall from "./VoiceRollCall.jsx";
import Marketing from "./Marketing.jsx";
import {
  Insights,
  ShareClass,
  StudentDirectory,
  DemoWorkspace,
} from "./WorkspaceExtras.jsx";
import StudentSetup, { PhotoCapture } from "./MediaSetup.jsx";
import "./style.css";
function Brand() {
  return (
    <div className="brand">
      <span className="logo">a</span>attendex
      <span style={{ color: "#8ca36c" }}>.</span>
    </div>
  );
}
function Empty({ title, children }) {
  return (
    <div className="empty">
      <span className="symbol" aria-hidden="true">
        ✳
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Auth({ register, onToggle, onBack, onSuccess, onRecovery }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [busy]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(register ? "register" : "login", form);
      try {
        await onSuccess();
      } catch {
        setError(
          "You are signed in, but the workspace could not load. Refresh the page; you do not need to register again.",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth">
      <Brand />
      <h1>{register ? "Your classroom starts here." : "Welcome back."}</h1>
      <p>
        {register
          ? "Create your account and make room for better learning."
          : "Your classes are right where you left them."}
      </p>
      <form onSubmit={submit}>
        {register && (
          <>
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              name="name"
              required
              maxLength={100}
              autoComplete="name"
            />
            <label htmlFor="role">I am a</label>
            <select id="role" name="role">
              <option value="teacher">Teacher / Professor</option>
              <option value="student">Student</option>
            </select>
          </>
        )}
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={register ? 12 : 10}
          maxLength={128}
          autoComplete={register ? "new-password" : "current-password"}
        />
        <small>
          {register ? "At least 12 characters" : "Your account password"}
        </small>
        <button className="full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account ↗" : "Sign in ↗"}
        </button>
        {slow && (
          <p role="status">
            The server is responding slowly. Free hosting may need time to wake
            up. Please keep this page open.
          </p>
        )}
        <p role="alert">{error}</p>
      </form>
      <button className="textbtn" onClick={onRecovery}>
        Forgot password?
      </button>
      <button className="textbtn" onClick={onToggle}>
        {register
          ? "Already have an account? Sign in"
          : "New here? Create an account"}
      </button>
      <button className="textbtn" onClick={onBack}>
        Back home
      </button>
    </section>
  );
}
function ClassModal({ teacher, onClose, onSave, initialCode = "" }) {
  const ref = useRef(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.querySelector("input").focus();
    return () => previous?.focus();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave(Object.fromEntries(new FormData(e.currentTarget)));
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function keys(e) {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab") {
      const elements = [...ref.current.querySelectorAll("button,input")],
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  return (
    <div className="modal" onKeyDown={keys}>
      <section
        ref={ref}
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="row between">
          <h2 id="modal-title">
            {teacher ? "Create a class" : "Join your class"}
          </h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          {teacher ? (
            <>
              <label htmlFor="classname">Class / subject name</label>
              <input
                id="classname"
                name="name"
                required
                maxLength={100}
                placeholder="Introduction to AI"
              />
              <label htmlFor="section">Section / batch</label>
              <input
                id="section"
                name="section"
                maxLength={80}
                placeholder="CSE · Year 2 · Section A"
              />
            </>
          ) : (
            <>
              <label htmlFor="code">Class code</label>
              <input
                id="code"
                name="code"
                required
                maxLength={20}
                defaultValue={initialCode}
              />
            </>
          )}
          <button className="full" disabled={busy}>
            {teacher ? "Create classroom" : "Join classroom"} ↗
          </button>
          <p role="alert">{error}</p>
        </form>
      </section>
    </div>
  );
}
function History({ classroom: c, user }) {
  const teacher = user.role === "teacher";
  return (
    <>
      <div className="row between">
        <h3>Attendance history</h3>
        <button className="ghost" onClick={() => exportAttendance(c, user)}>
          Export CSV ↓
        </button>
      </div>
      {c.historyLimited && (
        <p className="hint">
          Showing the latest 100 sessions. CSV exports on this screen include
          only the visible history.
        </p>
      )}
      {c.lessons.length ? (
        <div className="roster">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>{teacher ? "Confirmed / roster" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {c.lessons.map((l) => {
                const records = c.attendance.filter((a) => a.lesson === l.id);
                return (
                  <tr key={l.id}>
                    <td>
                      {new Date(l.created * 1000).toLocaleString()}
                      {l.active ? " · Open" : ""}
                    </td>
                    <td>
                      {teacher
                        ? `${records.filter((a) => ["present", "late"].includes(a.status)).length} / ${c.studentCount}`
                        : records[0]?.status || "unmarked"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="A fresh start">
          Attendance records will appear after your first session.
        </Empty>
      )}
    </>
  );
}
function Classroom({ classroom: c, user, mutate, refresh, notify, busy }) {
  const teacher = user.role === "teacher",
    lesson = c.lessons.find((l) => l.active),
    mine = c.attendance.find(
      (a) => a.lesson === lesson?.id && a.student === user.id,
    );
  return (
    <>
      <div className="row between">
        <h2>{c.name}</h2>
        <span className="tag">
          {lesson ? "Session open" : "No active session"}
        </span>
      </div>
      <p>
        {c.section}
        {teacher && (
          <>
            {" "}
            · Join code <strong className="code">{c.code}</strong>
          </>
        )}
      </p>
      {teacher ? (
        <div className="row">
          {!lesson ? (
            <button
              disabled={busy}
              onClick={() => mutate("lessons", { classId: c.id })}
            >
              Start attendance ↗
            </button>
          ) : (
            <button
              className="ghost"
              disabled={busy}
              onClick={() => mutate("close", { lesson: lesson.id })}
            >
              Close session
            </button>
          )}
          <button className="ghost" onClick={refresh}>
            Refresh records
          </button>
        </div>
      ) : lesson ? (
        <div className="voice">
          <h3>{mine ? "You’re checked in" : "Ready for today?"}</h3>
          <p>
            {mine
              ? `Status: ${mine.status}. Your teacher confirms attendance.`
              : "Send your check-in for teacher approval."}
          </p>
          {!mine && (
            <button
              disabled={busy}
              onClick={() => mutate("attendance", { lesson: lesson.id })}
            >
              Check in to this class ↗
            </button>
          )}
          <button className="textbtn" onClick={refresh}>
            Refresh status
          </button>
        </div>
      ) : (
        <p>Your teacher will open attendance during class.</p>
      )}
      {!teacher && (
        <details className="identity-details">
          <summary>Face & voice enrollment / comparison</summary>
          <BiometricPanel />
        </details>
      )}
      {teacher && <PhotoCapture classroom />}
      {teacher && (
        <GroupPhotoReview classroom={c} lesson={lesson} onRefresh={refresh} />
      )}
      {!teacher && <TrustedFaceEnrollment classroom={c} />}
      {teacher && lesson && (
        <VoiceRollCall
          key={lesson.id}
          classroom={c}
          lesson={lesson}
          onRefresh={refresh}
          onError={notify}
        />
      )}
      {teacher ? (
        lesson ? (
          <>
            <h3 style={{ marginTop: 25 }}>Class register</h3>
            {c.students.length ? (
              <div className="roster">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.students.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {s.name}
                          <div className="evidence-tags">
                            {Object.entries(
                              c.attendance.find(
                                (a) =>
                                  a.lesson === lesson.id && a.student === s.id,
                              )?.evidence || {},
                            ).map(([kind, value]) => (
                              <span
                                key={kind}
                                className={
                                  "tag " +
                                  (value.result === "match" ? "" : "pending")
                                }
                              >
                                {kind}:{" "}
                                {value.result === "match"
                                  ? "model match"
                                  : "review"}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <select
                            disabled={busy}
                            aria-label={`Attendance for ${s.name}`}
                            value={
                              c.attendance.find(
                                (a) =>
                                  a.lesson === lesson.id && a.student === s.id,
                              )?.status || "unmarked"
                            }
                            onChange={(e) =>
                              mutate("attendance", {
                                lesson: lesson.id,
                                student: s.id,
                                status: e.target.value,
                              })
                            }
                          >
                            {[
                              "unmarked",
                              "pending",
                              "present",
                              "late",
                              "absent",
                            ].map((v) => (
                              <option
                                key={v}
                                value={v}
                                disabled={v === "unmarked"}
                              >
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
            ) : (
              <Empty title="Invite your students">
                Share the class code so students can join.
              </Empty>
            )}
          </>
        ) : (
          <Empty title="Ready when you are">
            Start a session to take attendance.
          </Empty>
        )
      ) : (
        <History classroom={c} user={user} />
      )}
    </>
  );
}
export function App() {
  const [state, setState] = useState(null),
    [screen, setScreen] = useState(() =>
      window.location.hash.startsWith("#reset=") ||
      window.location.hash.startsWith("#verify=")
        ? "recovery"
        : "loading",
    ),
    [register, setRegister] = useState(false),
    [selected, setSelected] = useState(null),
    [view, setView] = useState("overview"),
    [modal, setModal] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const timer = useRef();
  const [recovery, setRecovery] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return {
      action: params.has("verify")
        ? "verify"
        : params.has("reset")
          ? "reset"
          : "request",
      token: params.get("verify") || params.get("reset") || "",
    };
  });
  const [shareClass, setShareClass] = useState(null);
  const [inviteCode, setInviteCode] = useState(
    () => new URLSearchParams(window.location.search).get("join") || "",
  );
  function notify(s) {
    setMessage(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 5000);
  }
  async function refresh() {
    try {
      const data = await api("state");
      setState(data);
      if (
        inviteCode &&
        data.user.role === "student" &&
        data.user.setup?.completed
      )
        setModal(true);
      setSelected((id) =>
        data.classes.some((c) => c.id === id) ? id : data.classes[0]?.id,
      );
      setScreen(
        data.user.role === "student" && !data.user.setup?.completed
          ? "setup"
          : "dashboard",
      );
    } catch (e) {
      if (e.status === 401) {
        setState(null);
        setScreen("landing");
      } else {
        notify(e.message);
        setScreen((s) => (s === "loading" ? "error" : s));
      }
    }
  }
  useEffect(() => {
    if (
      !window.location.hash.startsWith("#reset=") &&
      !window.location.hash.startsWith("#verify=")
    )
      refresh();
    return () => clearTimeout(timer.current);
  }, []);
  async function mutate(path, data) {
    setBusy(true);
    try {
      await api(path, data);
      await refresh();
    } catch (e) {
      notify(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("logout", {});
      setState(null);
      setScreen("landing");
    } catch (e) {
      notify(e.message);
    }
  }
  let content;
  if (screen === "loading") content = <Empty title="Opening your workspace…" />;
  else if (screen === "recovery")
    content = (
      <Recovery
        {...recovery}
        onBack={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setScreen("landing");
        }}
      />
    );
  else if (screen === "account")
    content = (
      <AccountSecurity
        onBack={refresh}
        onSignedOut={() => {
          setState(null);
          setScreen("landing");
        }}
      />
    );
  else if (screen === "error")
    content = (
      <div className="auth">
        <h2>Unable to reach Attendex</h2>
        <p>Check the API and database connection.</p>
        <button onClick={refresh}>Try again</button>
      </div>
    );
  else if (screen === "demo")
    content = (
      <DemoWorkspace
        onClose={() => setScreen(state ? "dashboard" : "landing")}
      />
    );
  else if (screen === "landing")
    content = (
      <Marketing
        onDemo={() => setScreen("demo")}
        onAuth={(r) => {
          setRegister(r);
          setScreen("auth");
        }}
      />
    );
  else if (screen === "auth")
    content = (
      <Auth
        key={String(register)}
        register={register}
        onToggle={() => setRegister((r) => !r)}
        onBack={() => setScreen("landing")}
        onRecovery={() => {
          setRecovery({ action: "request", token: "" });
          setScreen("recovery");
        }}
        onSuccess={refresh}
      />
    );
  else if (screen === "setup" && state)
    content = (
      <StudentSetup user={state.user} onDone={refresh} onLogout={logout} />
    );
  else if (state) {
    const u = state.user,
      teacher = u.role === "teacher",
      c = state.classes.find((c) => c.id === selected),
      classes = state.classes,
      records = classes.flatMap((c) => c.attendance),
      stats = [
        [classes.length, "Your classes"],
        [
          classes.reduce(
            (sum, c) => sum + (teacher ? c.studentCount : c.lessons.length),
            0,
          ),
          teacher ? "Enrolled students" : "Class sessions",
        ],
        [
          records.filter((a) => ["present", "late"].includes(a.status)).length,
          teacher ? "Confirmed records" : "Present / late",
        ],
      ];
    content = (
      <div className="shell">
        <aside className="sidebar">
          <Brand />
          <nav>
            {[
              ["overview", "◫", "Overview"],
              ["classes", "▦", "My classes"],
              ["records", "↗", "Attendance records"],
              ...(teacher ? [["students", "◉", "Students"]] : []),
            ].map(([id, icon, label]) => (
              <button
                key={id}
                className={view === id ? "active" : ""}
                onClick={() => setView(id)}
              >
                {icon} &nbsp; {label}
              </button>
            ))}
          </nav>
          <div className="foot">
            <p style={{ color: "#b9cbc1" }}>
              A little less admin.
              <br />A lot more teaching.
            </p>
            <small>ATTENDEX WORKSPACE</small>
          </div>
        </aside>
        <main className="main">
          <header className="top row between">
            <small>
              {teacher ? "Faculty" : "Student"} workspace / {view}
            </small>
            <div className="row">
              <span className="avatar">{u.name[0]}</span>
              <span>{u.name}</span>
              {!teacher && (
                <button className="ghost" onClick={() => setScreen("setup")}>
                  Camera & mic setup
                </button>
              )}
              <button className="ghost" onClick={() => setScreen("account")}>
                Account & security
              </button>
              <button className="textbtn" onClick={() => setScreen("demo")}>
                Explore demo
              </button>
              <button className="ghost" onClick={logout}>
                Sign out
              </button>
            </div>
          </header>
          <section className="greeting row between">
            <div>
              <span className="pill">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </span>
              <h1>
                {view === "records"
                  ? "A clearer picture."
                  : view === "classes"
                    ? "Your learning spaces."
                    : `Hello, ${u.name.split(" ")[0]}.`}
              </h1>
              <p>
                {teacher
                  ? "Set the tone for a great day of learning."
                  : "Show up. Check in. Keep growing."}
              </p>
            </div>
            <button onClick={() => setModal(true)}>
              {teacher ? "+ Create class" : "+ Join a class"}
            </button>
          </section>
          <section className="stats">
            {stats.map(([value, label]) => (
              <div className="card stat" key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
                <small>Across your classes</small>
              </div>
            ))}
          </section>
          {teacher && view === "overview" && <Insights classes={classes} />}
          <div className="workspace">
            <section>
              <div className="row between">
                <h3>My classes</h3>
                <small>{classes.length} total</small>
              </div>
              {classes.length ? (
                classes.map((cl) => (
                  <article
                    className={
                      "classcard " + (selected === cl.id ? "selected" : "")
                    }
                    key={cl.id}
                  >
                    <span className="pill">{cl.section || "General"}</span>
                    <h3 style={{ marginTop: 16 }}>{cl.name}</h3>
                    <p>
                      {cl.studentCount} students · {cl.lessons.length} sessions
                    </p>
                    <button
                      className="ghost"
                      onClick={() => setSelected(cl.id)}
                    >
                      Open classroom ↗
                    </button>
                    {teacher && (
                      <button
                        className="textbtn"
                        onClick={() => setShareClass(cl)}
                      >
                        Share invitation / QR ↗
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty title="Your first class awaits">
                  {teacher
                    ? "Create a class to invite students and start attendance."
                    : "Join using the code shared by your teacher."}
                </Empty>
              )}
            </section>
            <section className="card">
              {c ? (
                view === "students" && teacher ? (
                  <StudentDirectory classroom={c} />
                ) : view === "records" ? (
                  <History classroom={c} user={u} />
                ) : (
                  <Classroom
                    key={c.id}
                    classroom={c}
                    user={u}
                    mutate={mutate}
                    refresh={refresh}
                    notify={notify}
                    busy={busy}
                  />
                )
              ) : (
                <Empty title="Make room for learning">
                  Your classroom workspace will appear here.
                </Empty>
              )}
            </section>
          </div>
          <footer style={{ marginTop: 35 }}>
            Student check-ins require teacher confirmation. Unmarked students
            remain unmarked.
          </footer>
        </main>
        {shareClass && (
          <ShareClass
            classroom={shareClass}
            onClose={() => setShareClass(null)}
          />
        )}
        {modal && (
          <ClassModal
            teacher={teacher}
            initialCode={inviteCode}
            onClose={() => {
              setModal(false);
              setInviteCode("");
              window.history.replaceState(null, "", window.location.pathname);
            }}
            onSave={async (data) => {
              await api(teacher ? "classes" : "join", data);
              setInviteCode("");
              window.history.replaceState(null, "", window.location.pathname);
              await refresh();
            }}
          />
        )}
      </div>
    );
  }
  return (
    <>
      {content}
      {message && (
        <div id="notice" role="status" style={{ display: "block" }}>
          {message}
        </div>
      )}
    </>
  );
}
