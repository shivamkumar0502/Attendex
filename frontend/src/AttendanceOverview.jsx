import React from "react";

function Metric({ label, value, detail, tone = "default" }) {
  return (
    <article className={`overview-metric overview-metric-${tone}`}>
      <span className="overview-metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="overview-metric-detail">{detail}</span>
    </article>
  );
}

function getMetrics(classes) {
  const closedSessions = classes.flatMap((classroom) =>
    classroom.lessons.filter((lesson) => !lesson.active).map((lesson) => ({
      ...lesson,
      classroom,
    })),
  );
  const closedIds = new Set(closedSessions.map((lesson) => lesson.id));
  const closedRecords = classes.flatMap((classroom) =>
    classroom.attendance.filter((record) => closedIds.has(record.lesson)),
  );
  const expected = closedSessions.reduce(
    (total, lesson) => total + lesson.classroom.studentCount,
    0,
  );
  const confirmed = closedRecords.filter((record) =>
    ["present", "late"].includes(record.status),
  ).length;
  const pending = classes.reduce(
    (total, classroom) =>
      total +
      classroom.attendance.filter((record) => record.status === "pending").length,
    0,
  );
  const activeSessions = classes.reduce(
    (total, classroom) =>
      total + classroom.lessons.filter((lesson) => lesson.active).length,
    0,
  );
  return {
    confirmed,
    expected,
    pending,
    activeSessions,
    rate: expected ? Math.round((confirmed / expected) * 100) : null,
    recent: [...closedSessions]
      .sort((a, b) => b.created - a.created)
      .slice(0, 4),
  };
}

export default function AttendanceOverview({ classes }) {
  const metrics = getMetrics(classes);
  const formatDate = (timestamp) =>
    new Date(timestamp * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <section className="attendance-overview" aria-label="Attendance overview">
      <div className="overview-heading">
        <div>
          <span className="eyebrow">YOUR CLASSROOM AT A GLANCE</span>
          <h2>Attendance overview</h2>
          <p>Live classroom activity and confirmed records from your classes.</p>
        </div>
        <span className="overview-live"><i /> Updated from your workspace</span>
      </div>

      <div className="overview-metrics">
        <Metric
          label="Attendance rate"
          value={metrics.rate === null ? "—" : `${metrics.rate}%`}
          detail={metrics.expected ? `${metrics.confirmed} confirmed of ${metrics.expected} expected` : "No closed sessions yet"}
          tone="primary"
        />
        <Metric
          label="Pending review"
          value={metrics.pending}
          detail="Check-ins awaiting teacher review"
          tone="warning"
        />
        <Metric
          label="Live sessions"
          value={metrics.activeSessions}
          detail="Classrooms taking attendance now"
          tone="success"
        />
        <Metric
          label="Total classrooms"
          value={classes.length}
          detail={classes.reduce((sum, classroom) => sum + classroom.studentCount, 0) + " enrolled students"}
        />
      </div>

      <div className="overview-lower">
        <article className="overview-panel">
          <div className="overview-panel-heading">
            <div>
              <span className="eyebrow">SESSION ACTIVITY</span>
              <h3>Recent completed classes</h3>
            </div>
            <span className="overview-count">{metrics.recent.length} recent</span>
          </div>
          {metrics.recent.length ? (
            <div className="overview-session-list">
              {metrics.recent.map((session) => {
                const records = session.classroom.attendance.filter(
                  (record) => record.lesson === session.id,
                );
                const present = records.filter((record) =>
                  ["present", "late"].includes(record.status),
                ).length;
                return (
                  <div className="overview-session" key={session.id}>
                    <span className="overview-session-icon" aria-hidden="true">✓</span>
                    <div className="overview-session-info">
                      <strong>{session.classroom.name}</strong>
                      <span>{session.classroom.section || "General"} · {formatDate(session.created)}</span>
                    </div>
                    <span className="overview-session-result">
                      {present}/{session.classroom.studentCount}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overview-empty">
              <strong>Your activity will appear here</strong>
              <span>Close your first attendance session to see a summary.</span>
            </div>
          )}
        </article>

        <article className="overview-panel overview-completion">
          <span className="eyebrow">RECORD QUALITY</span>
          <h3>Keep attendance review clear</h3>
          <p>Only teacher-confirmed present and late records contribute to the attendance rate. Pending and unmarked records are never silently counted as absent.</p>
          <div className="overview-progress-label">
            <span>Confirmed attendance</span>
            <strong>{metrics.rate === null ? "Not available" : `${metrics.rate}%`}</strong>
          </div>
          <div
            className="overview-progress"
            role="progressbar"
            aria-label="Confirmed attendance rate"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={metrics.rate ?? 0}
          >
            <span style={{ width: `${metrics.rate ?? 0}%` }} />
          </div>
          <small>{metrics.pending} check-ins currently need review.</small>
        </article>
      </div>
    </section>
  );
}
