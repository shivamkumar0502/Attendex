// @vitest-environment jsdom
import React from "react";
import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BiometricPanel from "./BiometricPanel.jsx";
import { api } from "./api.js";
vi.mock("./api.js", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("never pretends enrollment is available without a configured server", async () => {
  api.mockResolvedValue({ enabled: false, face: false, voice: false });
  render(<BiometricPanel />);
  expect(
    await screen.findByText(
      "Matching is not configured on this server. Manual check-in remains available.",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Open comparison camera" }),
  ).toBeNull();
});
it("requires explicit consent before capture and keeps compare disabled until enrollment", async () => {
  api.mockResolvedValue({ enabled: true, face: false, voice: false });
  render(<BiometricPanel />);
  const button = await screen.findByRole("button", {
    name: "Open comparison camera",
  });
  expect(button).toBeDisabled();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});
