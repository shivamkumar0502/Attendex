import { mkdir, copyFile, readFile, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
const out = "frontend/public/models";
await mkdir(out, { recursive: true });
for (const net of [
  "tiny_face_detector",
  "face_landmark_68_tiny",
  "face_recognition",
])
  for (const file of [net + "_model.bin", net + "_model-weights_manifest.json"])
    await copyFile(
      join("node_modules/@vladmandic/face-api/model", file),
      join(out, file),
    );
await copyFile(
  "node_modules/@vladmandic/face-api/LICENSE",
  join(out, "face-api-LICENSE"),
);
const runtime = "frontend/public/ort";
await mkdir(runtime, { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
])
  await copyFile(
    join("node_modules/onnxruntime-web/dist", file),
    join(runtime, file),
  );
const base =
  "https://huggingface.co/vedk00/ecapa-voxceleb-speaker-embedding-onnx/resolve/a9cb9321b07b4ee5b0ea47fdd25242d9cacd824a/";
const files = [
  [
    "model/ecapa-speaker-v1.onnx",
    "f46380bbaeddb929fb3a10ab63a4b1877a50e3d1e5fdd55a1b618d5651d3f64e",
  ],
  [
    "model/fbank-80x201-f32.bin",
    "024e5073b7cfedee84408dc68dd6bafa02808fc786e67f1314e9c918297f5a63",
  ],
  [
    "LICENSE",
    "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  ],
  [
    "NOTICE",
    "49b2345ae4825b111c0818f92cb5ea879f0a4365f2f3becf0fcc179ef699f630",
  ],
];
for (const [file, expected] of files) {
  const dest = join(out, "voice", file);
  await mkdir(dirname(dest), { recursive: true });
  let data;
  try {
    data = await readFile(dest);
  } catch {}
  if (!data || createHash("sha256").update(data).digest("hex") !== expected) {
    const response = await fetch(base + file, {
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) throw Error("Model download failed: " + response.status);
    data = Buffer.from(await response.arrayBuffer());
    if (createHash("sha256").update(data).digest("hex") !== expected)
      throw Error("Model checksum mismatch: " + file);
    await writeFile(dest, data);
  }
  console.log("Verified model asset:", file);
}
