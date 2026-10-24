import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api.js";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("aborts stalled signup without retrying a possibly committed POST", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  const pending = expect(
    api("register", { email: "test@example.test" }),
  ).rejects.toThrow("may already have been created");
  await vi.advanceTimersByTimeAsync(25000);
  await pending;
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves server validation and duplicate-account errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Account already exists" }),
      }),
  );
  await expect(api("register", {})).rejects.toMatchObject({
    message: "Account already exists",
    status: 409,
  });
});
it("turns a dropped connection into an actionable message", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(api("login", {})).rejects.toThrow("connection was interrupted");
});
