# Manga Translator 2.0

A Chrome extension that detects comic text regions locally, sends numbered crops to the selected AI and displays the translation.

Version 2.0 moves detection from ONNX Runtime to **TensorFlow Lite / LiteRT.js 2.5.3**. This is not the TensorFlow.js variant. It carries forward the validated 1.0.3.15 implementation, including AI automation, Gemini API, Pi, streaming updates, missing-ID retries, language selection and custom instructions.

## Installation

Download **manga-translator-2.0.0.zip** from the [latest release](https://github.com/okinisu/manga-translator-extension/releases/latest). Use the extension asset rather than GitHub's auto-generated source archives.

1. Extract the ZIP to a dedicated folder.
2. Open `chrome://extensions`, enable Developer mode and load the folder containing `manifest.json`.
3. Disable the older extension to prevent duplicate operation. Reload the extension and comic tab after updating.
4. Review your AI provider, language and connection settings. See [PI.md](PI.md) for Pi setup.

## Inference settings

Auto uses partial FP16 on validated AMD RDNA3 devices and FP32 on NVIDIA. Full FP16 is available on validated AMD RDNA3 and NVIDIA Lovelace devices with shader-f16 support. NVIDIA Lovelace full-FP16 mode includes the optimized FP16 cache and fused multiply-add path without requiring experimental subgroup-matrix features. Individual Tensor Core modes remain experimental. GPU failures fall back according to the selected backend; CPU mode uses LiteRT WASM FP32.

## Validation

RTX 4060 Laptop / Linux Vulkan / Chrome beta 157, batch one, 640×640, three warmups, two independent four-image interleaved sessions: full-FP16 median response **36.03 → 29.21ms (18.9% shorter)** against 1.0.3.14. The measured 1.0.3.15 runtime is unchanged in 2.0.0. All 32 real fixtures preserve detection counts/classes against ONNX FP32; maximum box-edge difference is **0.713px**. This measures reference agreement, not human-labelled accuracy. Browser response timings include CPU fallback/readback and cannot be directly compared with official TensorRT timings. See [TENSOR-RESULTS.json](TENSOR-RESULTS.json) and [TESTING.md](TESTING.md).

See [MODEL.md](MODEL.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [PRIVACY.md](PRIVACY.md) and [CHANGELOG.md](CHANGELOG.md) for model, license, privacy and release details. Use is at your own responsibility.

## Source checkout

The three TFLite model files use Git LFS. Install Git LFS and run `git lfs pull` in the repository root before loading or packaging a source checkout. Release ZIPs contain the actual model files.

## Local 2.0.1 candidate

NVIDIA Lovelace native full-FP16 query selection uses exact stable GPU TopK. Two interleaved sessions show a 3.4% pooled median response improvement and 1.2% mean improvement; 32 real windows match 2.0.0 raw scores/boxes exactly. Chapter-level speedup is unmeasured. See TOPK-RESULTS.json.
