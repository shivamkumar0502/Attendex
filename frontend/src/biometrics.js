// Model-based 1:1 comparison signals. Not a trusted authentication factor.
let facePromise, voicePromise;
export const FACE_MODEL = "face-api-1.7.15";
export const VOICE_MODEL = "ecapa-speaker-v1-a9cb932";
export function normalized(values) {
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm < 1e-8)
    throw Error("Unable to extract a usable sample. Please retry.");
  return Array.from(values, (v) => v / norm);
}
async function loadFace() {
  if (!facePromise)
    facePromise = (async () => {
      const face = await import("@vladmandic/face-api/dist/face-api.esm.js");
      const webgl = await face.tf.setBackend("webgl").catch(() => false);
      if (!webgl) await face.tf.setBackend("cpu");
      await face.tf.ready();
      await Promise.all([
        face.nets.tinyFaceDetector.loadFromUri("/models"),
        face.nets.faceLandmark68TinyNet.loadFromUri("/models"),
        face.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      return face;
    })().catch((e) => {
      facePromise = null;
      throw e;
    });
  return facePromise;
}
export async function faceEmbedding(video) {
  const face = await loadFace();
  const results = await face
    .detectAllFaces(
      video,
      new face.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.65,
      }),
    )
    .withFaceLandmarks(true)
    .withFaceDescriptors();
  if (results.length !== 1)
    throw Error(
      results.length
        ? "Only one person should be in the frame."
        : "No clear face found. Face the camera in good light.",
    );
  const box = results[0].detection.box;
  if (box.width < 80 || box.height < 80)
    throw Error("Move closer to the camera and try again.");
  return normalized(results[0].descriptor);
}
// SpeechBrain STFT defaults: periodic Hamming window, 400-point DFT,
// 160-sample hop, centered zero padding, power spectrum, frozen mel bank,
// 10*log10, 80dB clipping and per-mel sentence mean subtraction.
export function voiceFeatures(wave, bank) {
  if (bank.length !== 201 * 80) throw Error("Invalid filterbank asset");
  const frames = 1 + Math.floor(wave.length / 160),
    features = new Float32Array(frames * 80),
    cos = new Float32Array(201 * 400),
    sin = new Float32Array(201 * 400),
    window = new Float32Array(400);
  for (let n = 0; n < 400; n++) {
    window[n] = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / 400);
    for (let k = 0; k <= 200; k++) {
      const a = (2 * Math.PI * k * n) / 400;
      cos[k * 400 + n] = Math.cos(a);
      sin[k * 400 + n] = Math.sin(a);
    }
  }
  let maximum = -Infinity;
  const frame = new Float32Array(400),
    power = new Float32Array(201);
  for (let t = 0; t < frames; t++) {
    for (let n = 0; n < 400; n++)
      frame[n] = (wave[t * 160 + n - 200] || 0) * window[n];
    for (let k = 0; k <= 200; k++) {
      let re = 0,
        im = 0;
      for (let n = 0; n < 400; n++) {
        re += frame[n] * cos[k * 400 + n];
        im += frame[n] * sin[k * 400 + n];
      }
      power[k] = re * re + im * im;
    }
    for (let m = 0; m < 80; m++) {
      let sum = 0;
      for (let k = 0; k <= 200; k++) sum += power[k] * bank[k * 80 + m];
      const value = 10 * Math.log10(Math.max(1e-10, sum));
      features[t * 80 + m] = value;
      maximum = Math.max(maximum, value);
    }
  }
  for (let m = 0; m < 80; m++) {
    let mean = 0;
    for (let t = 0; t < frames; t++) {
      features[t * 80 + m] = Math.max(features[t * 80 + m], maximum - 80);
      mean += features[t * 80 + m];
    }
    mean /= frames;
    for (let t = 0; t < frames; t++) features[t * 80 + m] -= mean;
  }
  return { features, frames };
}
export async function voiceEmbedding(blob) {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw Error("This browser cannot decode microphone audio.");
  const ctx = new Audio();
  let decoded;
  try {
    decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await ctx.close();
  }
  if (decoded.duration < 3 || decoded.duration > 12)
    throw Error("Please record between 3 and 10 seconds of speech.");
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * 16000),
    16000,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const wave = (await offline.startRendering()).getChannelData(0);
  const rms = Math.sqrt(wave.reduce((s, v) => s + v * v, 0) / wave.length);
  if (rms < 0.005)
    throw Error("Recording is too quiet. Speak closer to the microphone.");
  if (!voicePromise)
    voicePromise = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = "/ort/";
      const [session, response] = await Promise.all([
        ort.InferenceSession.create(
          "/models/voice/model/ecapa-speaker-v1.onnx",
          { executionProviders: ["wasm"] },
        ),
        fetch("/models/voice/model/fbank-80x201-f32.bin"),
      ]);
      if (!response.ok) throw Error("Voice model assets unavailable");
      const bank = new Float32Array(await response.arrayBuffer());
      return { ort, session, bank };
    })().catch((e) => {
      voicePromise = null;
      throw e;
    });
  const { ort, session, bank } = await voicePromise;
  const { features, frames } = voiceFeatures(wave, bank);
  const result = await session.run({
    features: new ort.Tensor("float32", features, [1, frames, 80]),
    feature_lens: new ort.Tensor("float32", new Float32Array([1]), [1]),
  });
  return normalized(result.embedding.data);
}
