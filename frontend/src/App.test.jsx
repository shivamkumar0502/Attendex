// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "./main.jsx";
import { api } from "./api.js";
vi.mock("./api.js", () => ({ api: vi.fn(), exportAttendance: vi.fn() }));
vi.mock("./BiometricPanel.jsx", () => ({ default: () => null }));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr") },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
});
it("student sees first-login onboarding and can complete setup before joining an invitation", async () => {
  window.history.replaceState(null, "", "/?join=INVITE123");
  let complete = false;
  api.mockImplementation(async (path) => {
    if (path === "state")
      return {
        user: {
          id: "s",
          name: "Aarav",
          role: "student",
          setup: { completed: complete },
        },
        classes: [],
      };
    if (path === "setup") {
      complete = true;
      return { ok: true };
    }
    return { ok: true };
  });
  render(<App />);
  expect(
    await screen.findByText("Let’s get you classroom-ready."),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Continue without remaining checks →" }),
  );
  await screen.findByRole("dialog");
  expect(screen.getByLabelText("Class code")).toHaveValue("INVITE123");
});
it("teacher can open the QR invitation and student directory from their workspace", async () => {
  api.mockResolvedValue({
    user: { id: "t", name: "Professor", role: "teacher" },
    classes: [
      {
        id: "c",
        name: "AI Systems",
        section: "A",
        code: "CODE123",
        studentCount: 1,
        students: [{ id: "s", name: "Aarav", setupCompleted: true }],
        lessons: [],
        attendance: [],
      },
    ],
  });
  render(<App />);
  await screen.findByText("Hello, Professor.");
  fireEvent.click(
    screen.getByRole("button", { name: "Share invitation / QR ↗" }),
  );
  await screen.findByAltText("QR code to join AI Systems");
  fireEvent.click(screen.getByRole("button", { name: "Close sharing" }));
  fireEvent.click(screen.getByRole("button", { name: /Students/ }));
  expect(await screen.findByText("Your students")).toBeInTheDocument();
  expect(screen.getByText("Device setup: complete")).toBeInTheDocument();
});
