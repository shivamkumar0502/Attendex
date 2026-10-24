# Model and runtime sources

Model files are fetched/copied by `scripts/prepare-models.mjs`, served from the same origin and excluded from Git.

## Face

- Library: [@vladmandic/face-api](https://github.com/vladmandic/face-api), npm 1.7.15 (locked in package-lock.json), MIT.
- Assets: tiny face detector, tiny 68-point landmarks and face recognition models shipped in the package.
- Enabled output: detection, landmarks and 128-dimensional descriptors only. Attribute models are not loaded.
- The repository is archived; a supported model/runtime migration should be evaluated before commercial rollout. The package license is copied with the model assets.

## Voice

- Upstream: [SpeechBrain spkrec-ecapa-voxceleb](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb).
- ONNX package: [vedk00/ecapa-voxceleb-speaker-embedding-onnx](https://huggingface.co/vedk00/ecapa-voxceleb-speaker-embedding-onnx), revision `a9cb9321b07b4ee5b0ea47fdd25242d9cacd824a`, Apache-2.0.
- SHA-256 ONNX: `f46380bbaeddb929fb3a10ab63a4b1877a50e3d1e5fdd55a1b618d5651d3f64e`.
- SHA-256 frozen filterbank: `024e5073b7cfedee84408dc68dd6bafa02808fc786e67f1314e9c918297f5a63`.
- LICENSE/NOTICE are downloaded, verified and served alongside the assets.
- Inputs: `features` float32 `[batch, frames, 80]`, `feature_lens` float32 `[batch]`; output: `embedding` float32 `[batch,192]`.
- Preprocessing follows the package manifest and [SpeechBrain feature implementation](https://github.com/speechbrain/speechbrain/blob/develop/speechbrain/processing/features.py): 16 kHz mono, 400-point centered/zero-padded Hamming-window STFT, hop 160, power spectrum, frozen 80-bin mel bank, log scale, 80 dB clipping and per-feature mean subtraction.

## Browser inference

[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) runs the voice model with a single WASM thread. First use needs roughly 84 MB of voice weights plus WASM runtime downloads. Slow or low-memory phones may fail; the UI retains manual attendance and reports model errors rather than inventing a match.

These sources and licenses do not establish biometric suitability, consent compliance, anti-spoofing or demographic fairness for any institution. No such certification is claimed.
