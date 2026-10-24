import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, exportAttendance } from "./api.js";
import VoiceRollCall from "./VoiceRollCall.jsx";
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
function Landing({ onAuth }) {
  return (
    <div className="landing">
      <nav className="row between">
        <Brand />
        <small>BUILT AROUND YOUR CLASSROOM</small>
        <button onClick={() => onAuth(false)}>Sign in ↗</button>
      </nav>
      <section className="hero">
        <div>
          <span className="pill">Less admin. More learning.</span>
          <h1>
            Every student.
            <br />
            Every class.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p>
            A calmer way to manage attendance. Bring classes, voice-assisted
            roll-call and student check-ins together in one thoughtful
            workspace.
          </p>
          <div className="row">
            <button onClick={() => onAuth(true)}>
              Meet your new classroom ↗
            </button>
            <button className="ghost" onClick={() => onAuth(false)}>
              I'm a student
            </button>
          </div>
          <p className="hint">
            For schools, colleges, and the people who teach.
          </p>
        </div>
        <div className="preview">
          <span className="pill" style={{ color: "#203d36" }}>
            WORKSPACE PREVIEW
          </span>
          <h2>Good morning, Professor.</h2>
          <p>A little less roll-call. A little more possibility.</p>
          <div className="mini">
            <div className="row between">
              <h3>Introduction to AI</h3>
              <span className="tag">Live session</span>
            </div>
            <small>Computer Science · Section A</small>
            {["Aarav Sharma", "Ananya Singh", "Kabir Patel"].map((name, i) => (
              <div className="person" key={name}>
                <span className="avatar">
                  {name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
                <span style={{ flex: 1 }}>{name}</span>
                <span className={"tag " + (i === 2 ? "pending" : "")}>
                  {i === 2 ? "In review" : "Present"}
                </span>
              </div>
            ))}
            <div className="voice">
              <span className="wave">▂ ▅ ▃ ▇ ▅ ▂</span>
              <p>Voice-assisted. Teacher confirmed.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="features">
        {[
          [
            "01 / CONNECT",
            "One class, one place.",
            "Create a class, share its code, and welcome your students.",
          ],
          [
            "02 / CHECK IN",
            "A familiar voice.",
            "Read names aloud and capture spoken responses during roll-call.",
          ],
          [
            "03 / UNDERSTAND",
            "Records with clarity.",
            "Review check-ins, confirm attendance and export your class records.",
          ],
        ].map(([n, title, body]) => (
          <article className="card" key={n}>
            <small>{n}</small>
            <b>{title}</b>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <footer>Attendex · More time for what matters.</footer>
    </div>
  );
}
function Auth({ register, onToggle, onBack, onSuccess }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        register ? "register" : "login",
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      await onSuccess();
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
          minLength={10}
          maxLength={128}
          autoComplete={register ? "new-password" : "current-password"}
        />
        <small>At least 10 characters</small>
        <button className="full" disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account ↗" : "Sign in ↗"}
        </button>
        <p role="alert">{error}</p>
      </form>
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
function ClassModal({ teacher, onClose, onSave }) {
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
              <input id="code" name="code" required maxLength={20} />
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
      {teacher && <PhotoCapture classroom />}
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
                        <td>{s.name}</td>
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
function App() {
  const [state, setState] = useState(null),
    [screen, setScreen] = useState("loading"),
    [register, setRegister] = useState(false),
    [selected, setSelected] = useState(null),
    [view, setView] = useState("overview"),
    [modal, setModal] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const timer = useRef();
  function notify(s) {
    setMessage(s);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 5000);
  }
  async function refresh() {
    try {
      const data = await api("state");
      setState(data);
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
  else if (screen === "error")
    content = (
      <div className="auth">
        <h2>Unable to reach Attendex</h2>
        <p>Check the API and database connection.</p>
        <button onClick={refresh}>Try again</button>
      </div>
    );
  else if (screen === "landing")
    content = (
      <Landing
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
                        onClick={() =>
                          navigator.clipboard
                            .writeText(cl.code)
                            .then(() => notify("Class code copied"))
                            .catch(() => notify(`Class code: ${cl.code}`))
                        }
                      >
                        Copy class code
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
                view === "records" ? (
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
        {modal && (
          <ClassModal
            teacher={teacher}
            onClose={() => setModal(false)}
            onSave={async (data) => {
              await api(teacher ? "classes" : "join", data);
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
createRoot(document.getElementById("root")).render(<App />);
