# Bundled detector

The upstream model is [ogkalu/comic-text-and-bubble-detector](https://huggingface.co/ogkalu/comic-text-and-bubble-detector/tree/16e8a62), based on RT-DETR-v2 r50vd, distributed with an Apache-2.0 license declaration.

- Fixed input: 1×3×640×640, FP32 image input.
- 300 prediction candidates with bubble / text_bubble / text_free classes.
- The extension selects text_bubble and text_free; default confidence threshold: 0.48.
- Detects geometry, not recognized text. OCR and translation are performed by the selected remote AI.

## Included derivatives

| File | Precision / use |
|---|---|
| vendor/detector_fp32.onnx | FP32, WebGPU fallback |
| vendor/detector_gpu_fp16.onnx | Partial FP16, WebGPU with shader-f16 |
| vendor/detector_int8_static.onnx | Original dynamic INT8 quantization retained, integer shape folding, CPU/WASM |

The filename int8_static describes fixed model shapes, not static activation quantization. GPU derivatives use fixed shapes, raw scores/boxes and JavaScript TopK/coordinate postprocessing. Partial FP16 includes backbone/encoder and decoder float islands; final decoder normalization, remaining unsupported operations, postprocessing and external inputs/outputs remain FP32.

The CPU and GPU configuration JSON files record exact model SHA-256 hashes, transformations and validation provenance. These are existing model-validation records, not claims of new measurements for release 1.0.0. Retain model/runtime licenses and notices when copying the weights.

Runtime: ONNX Runtime Web 1.30.0 for partial-FP16 WebGPU; 1.23.2 for FP32 WebGPU/CPU. Native Graph Capture auto applies only to AMD partial FP16; explicit on is experimental. GPU selection and feature availability are determined by the browser.

This repository does not include upstream training images or a reproducible model-training pipeline.
