// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { classMetrics, DemoWorkspace, ShareClass } from "./WorkspaceExtras.jsx";
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));
afterEach(cleanup);
it("uses only closed sessions for class rates and leaves missing records unmarked", () => {
  const metrics = classMetrics({
    studentCount: 4,
    lessons: [
      { id: "old", active: false },
      { id: "live", active: true },
    ],
    attendance: [
      { lesson: "old", student: "1", status: "present" },
      { lesson: "old", student: "2", status: "late" },
      { lesson: "old", student: "3", status: "absent" },
      { lesson: "live", student: "1", status: "pending" },
    ],
  });
  expect(metrics).toEqual({ closed: 1, rate: 50, pending: 1, unmarked: 1 });
  expect(
    classMetrics({ studentCount: 0, lessons: [], attendance: [] }).rate,
  ).toBeNull();
});
it("demo offers student check-in and teacher review without API calls", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<DemoWorkspace onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Student workspace" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Check in to demo session" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Teacher workspace" }));
  expect(screen.getByLabelText("Demo attendance for Diya Mehta")).toHaveValue(
    "pending",
  );
  fireEvent.change(screen.getByLabelText("Demo attendance for Diya Mehta"), {
    target: { value: "present" },
  });
  expect(screen.getByLabelText("Demo attendance for Diya Mehta")).toHaveValue(
    "present",
  );
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
});
it("QR invitation includes the actual class code and encoded join URL", async () => {
  render(
    <ShareClass classroom={{ code: "ABC123", name: "AI" }} onClose={vi.fn()} />,
  );
  await screen.findByAltText("QR code to join AI");
  expect(screen.getByLabelText("Class code")).toHaveValue("ABC123");
  expect(screen.getByLabelText("Invitation link").value).toContain(
    "?join=ABC123",
  );
});
