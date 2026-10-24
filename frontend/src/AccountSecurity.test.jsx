// @vitest-environment jsdom
import React from "react";
import { afterEach, it, vi, expect } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Recovery } from "./AccountSecurity.jsx";
import { GroupPhotoReview, TrustedFaceEnrollment } from "./TrustedFace.jsx";
import { api } from "./api.js";
vi.mock("./api.js", () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("recovery uses the server token and clears the fragment only after success", async () => {
  api.mockResolvedValue({ ok: true });
  window.history.replaceState(null, "", "/#reset=single-use");
  render(<Recovery action="reset" token="single-use" onBack={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "a-new-long-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith("auth/reset/complete", {
      token: "single-use",
      newPassword: "a-new-long-password",
    }),
  );
  await screen.findByText(
    "Password updated. All previous login sessions have been signed out.",
  );
  expect(window.location.hash).toBe("");
});
it("does not show group recognition or liveness as available when the provider is unconfigured", async () => {
  api.mockResolvedValue({ enabled: false });
  render(
    <>
      <GroupPhotoReview
        classroom={{ id: "class", students: [] }}
        lesson={{ id: "lesson" }}
        onRefresh={vi.fn()}
      />
      <TrustedFaceEnrollment classroom={{ id: "class" }} />
    </>,
  );
  await screen.findByText(
    "Managed face matching/liveness is not configured. Photos do not currently generate attendance suggestions.",
  );
  expect(
    screen.queryByRole("button", { name: "Start live face check" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Analyze photos for review" }),
  ).toBeNull();
});
