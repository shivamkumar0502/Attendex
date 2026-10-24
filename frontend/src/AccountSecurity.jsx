import React, { useEffect, useState } from "react";
import { api } from "./api.js";
export function Recovery({ action = "request", token = "", onBack }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      if (action === "verify") await api("auth/email/complete", { token });
      else if (action === "reset")
        await api("auth/reset/complete", { token, newPassword: data.password });
      else await api("auth/reset/request", { email: data.email });
      setMessage(
        action === "verify"
          ? "Email verified. You can return to your account."
          : action === "reset"
            ? "Password updated. All previous login sessions have been signed out."
            : "If the account exists, recovery instructions will be sent.",
      );
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <h1>
        {action === "verify"
          ? "Verify your email."
          : action === "reset"
            ? "Choose a new password."
            : "Recover your account."}
      </h1>
      {!message && (
        <form onSubmit={submit}>
          {action === "request" ? (
            <>
              <label htmlFor="recovery-email">Account email</label>
              <input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </>
          ) : action === "reset" ? (
            <>
              <label htmlFor="recovery-password">New password</label>
              <input
                id="recovery-password"
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
              <small>12–128 characters</small>
            </>
          ) : (
            <p>
              Confirm the email verification link for your Attendex account.
            </p>
          )}
          <button className="full" disabled={busy}>
            {busy
              ? "Please wait…"
              : action === "verify"
                ? "Verify email"
                : action === "reset"
                  ? "Update password"
                  : "Send recovery instructions"}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
      <p role="alert" className="media-error">
        {error}
      </p>
      <button className="ghost" onClick={onBack}>
        Back to Attendex
      </button>
    </main>
  );
}
export default function AccountSecurity({ onBack, onSignedOut }) {
  const [account, setAccount] = useState(null),
    [teachers, setTeachers] = useState([]),
    [audit, setAudit] = useState([]),
    [ready, setReady] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const info = await api("account");
      setAccount(info);
      setAudit((await api("audit")).entries);
      if (info.isAdmin) {
        setTeachers((await api("admin/teachers")).teachers);
        setReady(await api("admin/readiness"));
      }
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function act(path, data = {}) {
    setBusy(true);
    setError("");
    try {
      await api(path, data);
      if (path === "auth/sessions/revoke") return onSignedOut();
      setMessage(
        path === "auth/email/request"
          ? "Verification link requested. Check your inbox."
          : "Updated successfully.",
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup-page">
      <header className="row between">
        <h2>Account & security</h2>
        <button className="ghost" onClick={onBack}>
          Back to workspace ↗
        </button>
      </header>
      {account && (
        <>
          <div className="insights-grid">
            <section className="card">
              <h3>{account.user.name}</h3>
              <p className="hint" role="status">
                Email service:{" "}
                {
                  {
                    connected:
                      "SMTP connection checked. Inbox delivery still needs confirmation.",
                    failed:
                      "SMTP connection failed. Ask your operator to check the Brevo credentials and sender settings.",
                    checking: "Checking SMTP connection…",
                    unconfigured: "Not configured.",
                    unchecked: "Connection has not been checked.",
                  }[account.emailTransport?.status || "unchecked"]
                }
              </p>
              <p>
                Email:{" "}
                {account.user.emailVerified ? "verified" : "not verified"}
              </p>
              {!account.user.emailVerified && (
                <button
                  disabled={busy || !account.emailDelivery}
                  onClick={() => act("auth/email/request")}
                >
                  Send verification link
                </button>
              )}
              {!account.emailDelivery && (
                <p className="hint">
                  Your operator needs to configure email delivery before email
                  verification and recovery can be used.
                </p>
              )}
              {account.user.role === "teacher" && (
                <p>
                  Teacher approval:{" "}
                  {account.user.teacherApproved ? "approved" : "pending"}
                  {!account.requireTeacherApproval
                    ? " · Pilot mode does not enforce approval."
                    : ""}
                </p>
              )}
              <button className="textbtn" onClick={load}>
                Refresh status
              </button>
            </section>
            <section className="card">
              <h3>Control your sessions</h3>
              <p>
                Sign out every device if you think another person can access
                your account.
              </p>
              <button
                className="ghost"
                disabled={busy}
                onClick={() => act("auth/sessions/revoke")}
              >
                Sign out all devices
              </button>
            </section>
          </div>
          {account.isAdmin && (
            <section className="card">
              <h3>Teacher approvals</h3>
              <p>
                Approve only after confirming the teacher’s institutional role.
                The teacher must verify their email first.
              </p>
              {teachers.map((t) => (
                <div className="person row between" key={t._id}>
                  <span>
                    {t.name} · {t.email}
                  </span>
                  <button
                    disabled={busy || !t.emailVerified}
                    onClick={() =>
                      act("admin/teachers/approve", { userId: t._id })
                    }
                  >
                    {t.emailVerified
                      ? "Approve teacher"
                      : "Awaiting verified email"}
                  </button>
                </div>
              ))}
              {!teachers.length && <p>No pending teachers.</p>}
            </section>
          )}
          {ready && (
            <section className="card" style={{ marginTop: 20 }}>
              <h3>Release readiness · {ready.mode}</h3>
              {Object.entries(ready.checks).map(([name, value]) => (
                <div className="person row between" key={name}>
                  <span>{name}</span>
                  <span className={"tag " + (value ? "" : "pending")}>
                    {value ? "Configured" : "Not accepted yet"}
                  </span>
                </div>
              ))}
              <p>{ready.notice}</p>
            </section>
          )}
          <section className="card" style={{ marginTop: 20 }}>
            <h3>
              {account.isAdmin
                ? "Recent application activity"
                : "Your recent activity"}
            </h3>
            <p className="hint">
              Latest 50 recorded entries. Request bodies, passwords, tokens and
              biometric templates are excluded.
            </p>
            <div className="roster">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((item, i) => (
                    <tr key={i}>
                      <td>{new Date(item.at).toLocaleString()}</td>
                      <td>{item.action}</td>
                      <td>{item.status || "reviewed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <p role="status">{message}</p>
      <p role="alert" className="media-error">
        {error}
      </p>
    </main>
  );
}
