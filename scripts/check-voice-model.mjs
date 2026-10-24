import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as ort from "onnxruntime-web/wasm";
import { voiceFeatures, normalized } from "../frontend/src/biometrics.js";
// Synthetic noise validates the model contract, not speaker recognition accuracy.
let seed = 42;
const wave = Float32Array.from({ length: 64000 }, () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed / 2 ** 32 - 0.5) * 0.2;
});
const b = await readFile(
  "frontend/public/models/voice/model/fbank-80x201-f32.bin",
);
const bank = new Float32Array(
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
);
const { features, frames } = voiceFeatures(wave, bank);
assert.equal(frames, 401);
assert(features.every(Number.isFinite));
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(
  await readFile("frontend/public/models/voice/model/ecapa-speaker-v1.onnx"),
  { executionProviders: ["wasm"] },
);
const output = await session.run({
  features: new ort.Tensor("float32", features, [1, frames, 80]),
  feature_lens: new ort.Tensor("float32", new Float32Array([1]), [1]),
});
const vector = normalized(output.embedding.data);
assert.equal(vector.length, 192);
assert(vector.every(Number.isFinite));
assert(Math.abs(Math.hypot(...vector) - 1) < 1e-5);
console.log(
  "ECAPA model contract passed: 401x80 input -> 192 finite normalized dimensions. This is not an accuracy benchmark.",
);
