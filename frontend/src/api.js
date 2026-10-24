export async function api(path, data) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch("/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: data === undefined ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: "same-origin",
      signal: controller.signal,
    });
    const payload = await response
      .json()
      .catch(() => ({ error: "Unable to reach the API" }));
    if (!response.ok) {
      const error = new Error(payload.error || "Request failed");
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (controller.signal.aborted || error instanceof TypeError) {
      const message =
        path === "register"
          ? "The server did not respond. Your account may already have been created; try signing in before registering again."
          : "The server is taking too long or your connection was interrupted. Please try again shortly.";
      throw new Error(message);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
export function exportAttendance(classroom, user) {
  const rows = [["Class", "Session", "Student", "Status"]];
  for (const lesson of classroom.lessons)
    for (const student of user.role === "teacher" ? classroom.students : [user])
      rows.push([
        classroom.name,
        new Date(lesson.created * 1000).toISOString(),
        student.name,
        classroom.attendance.find(
          (a) => a.lesson === lesson.id && a.student === student.id,
        )?.status || "unmarked",
      ]);
  const quote = (v) =>
    '"' +
    String(v)
      .replace(/^[\s]*[=+@\-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob([rows.map((r) => r.map(quote).join(",")).join("\r\n")], {
      type: "text/csv",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "attendex-attendance.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
