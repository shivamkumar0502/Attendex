// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StudentSetup, { PhotoCapture, MicrophoneCheck } from "./MediaSetup.jsx";
import { api } from "./api.js";
vi.mock("./BiometricPanel.jsx", () => ({ default: () => null }));
vi.mock("./api.js", () => ({ api: vi.fn() }));
let stop, getUserMedia;
beforeEach(() => {
  stop = vi.fn();
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,preview",
  );
  URL.createObjectURL = vi.fn().mockReturnValue("blob:test");
  URL.revokeObjectURL = vi.fn();
  api.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("camera controls", () => {
  it("opens the rear classroom camera, captures a preview, stops the camera and supports deletion", async () => {
    const captured = vi.fn();
    render(<PhotoCapture classroom onCaptured={captured} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Take classroom photo" }),
    );
    await screen.findByRole("button", { name: "Capture photo" });
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({
          facingMode: { ideal: "environment" },
        }),
      }),
    );
    const video = screen.getByLabelText("Camera preview");
    Object.defineProperty(video, "videoWidth", { value: 1280 });
    Object.defineProperty(video, "videoHeight", { value: 720 });
    fireEvent.click(screen.getByRole("button", { name: "Capture photo" }));
    expect(
      screen.getByAltText("Captured classroom preview"),
    ).toBeInTheDocument();
    expect(stop).toHaveBeenCalled();
    expect(captured).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("link", { name: "Download photo ↓" }),
    ).toHaveAttribute("download", "attendex-classroom.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Delete preview" }));
    expect(screen.queryByAltText("Captured classroom preview")).toBeNull();
  });
  it("explains permission denial without crashing", async () => {
    getUserMedia.mockRejectedValue(
      Object.assign(new Error(), { name: "NotAllowedError" }),
    );
    render(<PhotoCapture />);
    fireEvent.click(screen.getByRole("button", { name: "Open camera" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Permission denied",
    );
  });
  it("stops tracks when leaving the camera and when a pending permission resolves after unmount", async () => {
    let resolve;
    getUserMedia.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount } = render(<PhotoCapture />);
    fireEvent.click(screen.getByRole("button", { name: "Open camera" }));
    unmount();
    resolve({ getTracks: () => [{ stop }] });
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
it("records a microphone test with playback and releases the microphone", async () => {
  class Recorder {
    constructor() {
      this.state = "inactive";
      this.mimeType = "audio/webm";
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["sample"]) });
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", Recorder);
  const tested = vi.fn();
  render(<MicrophoneCheck onTested={tested} />);
  fireEvent.click(screen.getByRole("button", { name: "Test microphone" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Stop recording" }),
  );
  expect(
    await screen.findByLabelText("Microphone test playback"),
  ).toHaveAttribute("src", "blob:test");
  expect(tested).toHaveBeenCalledOnce();
  expect(stop).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete recording" }));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  vi.unstubAllGlobals();
});
it("allows setup to be skipped and saves only device flags", async () => {
  const done = vi.fn();
  render(<StudentSetup user={{ name: "Aarav" }} onDone={done} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Continue without remaining checks →" }),
  );
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(api).toHaveBeenCalledWith("setup", {
    cameraTested: false,
    micTested: false,
  });
});
it("shows a save error so students can retry", async () => {
  api.mockRejectedValueOnce(new Error("Please try again"));
  render(<StudentSetup user={{ name: "Aarav" }} onDone={vi.fn()} />);
  fireEvent.click(
    screen.getByRole("button", { name: "Continue without remaining checks →" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Please try again",
  );
});
