# Validation

Run `python3 scripts/test_extension.py` in the repository root. This runs the 36 regression suites, JavaScript syntax checks and bundled model hash checks. Build the release ZIP with `python3 scripts/package_extension.py --output dist`.

The historical GPU report names below refer to local development evidence; the raw fixtures, conversion environment and reports are not included in this repository. Summary results and measurement limits are recorded in TENSOR-RESULTS.json and TFLITE-OPTIMIZATION.json. Live AI DOM/account interactions require manual verification.

1.0.3.6 GPU evidence: TFLITE-AMD-PRODUCTION-PARTIAL32.json + TFLITE-AMD-PRODUCTION-ACCURACY.json verify integrated AMD automatic partial FP16. TFLITE-NVIDIA-PRODUCTION-PARTIAL32.json + TFLITE-NVIDIA-PRODUCTION-ACCURACY.json verify NVIDIA automatic full FP32 (inspect startup.modelPrecision). Both cover 32 images. TFLITE-AMD-PARTIAL-AB.json records a 12-sample interleaved speed comparison. Rejected NVIDIA partial and invalid-shader timings are archived in conversion/ and must not be presented as valid speed measurements.

litert-gpu-tests.cjs covers extension insertion, mixed Winograd casts, idempotence, FP32 preservation, compile/device error detection and cleanup. tflite-worker-tests.cjs covers packed GPU input reuse, precision gates, split interface validation and partial→FP32→CPU recovery. Live AI DOM/account interactions are inherited but not re-exercised with user accounts during model optimization.

Use the extension benchmark to compare auto and FP32 on one local image. Full-episode latency, other GPU families and all-image accuracy remain outside the measured scope. Root validation reports, source models/fixtures, conversion scripts and developer profiling hooks are excluded from the installable ZIP.

1.0.3.6 full FP16: TFLITE-AMD-FULL16-AB.json compares 12 interleaved runs per variant. TFLITE-AMD-PRODUCTION-FULL32.json and its ACCURACY report verify the integrated opt-in path on 32 fixtures. Maximum score change 0.02938 can affect threshold-adjacent detections beyond these fixtures.

1.0.3.6: TFLITE-AMD-HALF-CONV-AB.json (12 interleaved measurements), TFLITE-AMD-HALF-CONV32.json and ACCURACY report (32 real fixtures). Integrated production evidence is collected separately before packaging. GPU timestamp profile is instrumented and must not be compared directly to uninstrumented response timings.

1.0.3.7: TFLITE-AMD-PARTIAL-HALFCONV-AB.json records 12 warmed interleaved runs per variant. TFLITE-AMD-PARTIAL-HALFCONV32.json and ACCURACY report cover 32 images. Worker tests separately verify partial/full precision transformation flags, explicit FP32 exclusion and validation-disabled exclusion. Integrated production evidence is collected before packaging.

Integrated 1.0.3.7 evidence: TFLITE-AMD-V7-PRODUCTION-PARTIAL32.json + TFLITE-AMD-V7-PRODUCTION-ACCURACY.json.

1.0.3.8: GPU-INPUT-PIXEL-VALIDATION.json verifies exact opaque 256-level normalization; transparent values differ and are excluded by the opaque contract. TFLITE-AMD-GPU-INPUT-AB.json / TFLITE-NVIDIA-GPU-INPUT-AB.json measure preprocessing plus inference. AMD full-FP16 and NVIDIA FP32 GPU-INPUT-32 reports cover 32 fixtures. gpu-input-tests.cjs and worker tests cover copy failure, unmarked transparency, packed-buffer requirements, reuse and cleanup. Integrated chapter calls explicitly mark white-composited windows opaque.

Integrated AMD automatic mode: TFLITE-AMD-V8-PRODUCTION-PARTIAL32.json + TFLITE-AMD-V8-PRODUCTION-ACCURACY.json; gpuInputPrepared is true for all checked requests.

1.0.3.9: TFLITE-NVIDIA-EXPERIMENT-FULL16-32.json + ACCURACY report validate the candidate; TFLITE-NVIDIA-FULL16-AB.json records12 warmed interleaved samples per variant. Integrated full-FP16 verification is repeated before packaging. Worker tests assert that auto stays FP32 when only full-FP16 support is enabled.

Integrated1.0.3.9: TFLITE-NVIDIA-V9-PRODUCTION-FULL32-REPEAT.json, two independent full-FP16 sessions; TFLITE-NVIDIA-V9-PRODUCTION-{1,2}-ACCURACY.json compare each against ONNX FP32. Every checked request uses GPU direct input.

## 1.0.3.10 matrix experiment

33 existing suites and JavaScript syntax checks pass. Real GPU tests: TENSOR-FINAL-32-VALIDATION.json (32 images, FP16 matrix and INT8 matrix versus ONNX FP32), TENSOR-FINAL-AB.json (24 interleaved runs/mode, buffer counts and bytes stable), AMD-FALLBACK-AB.json (unsupported matrix feature falls back to ordinary FP16). Reports TENSOR-0-32-ACCURACY.json and TENSOR-1-32-ACCURACY.json preserve per-image errors. Tests do not establish performance on other GPUs or human-labelled detection accuracy.

## 1.0.3.11 final validation

34 suites pass, including tensor-convolution-tests.cjs for persistent buffer counts, no steady parameter uploads, original binding restoration, dynamic-offset/noncontiguous-layout fallback and destruction of all owned buffers.

TENSOR-TUNING-AB.json compares eight INT8 tile configurations. TENSOR-GPU-PROFILE.json records per-category GPU timestamps (profiling overhead changes total duration). TENSOR-OPT-32-VALIDATION.json and TENSOR-OPT-1-32-ACCURACY.json record final 32-image model agreement. TENSOR-OPT-FINAL-AB-1.json and -2.json contain two independent 24-run interleaved comparisons; TENSOR-RESULTS.json pools the 48 timings per mode. Additional GPU buffer bytes remain constant across repeated inferences.

## 1.0.3.12 final verification

35 suites pass. block-tensor-tests.cjs verifies original/new hook composition, residual resource binding, group-1/2 layouts, persistence of the previous large group-4 path, reuse without parameter uploads, unsupported channel alignment, and destruction of all owned GPU buffers.

NEXT-FINAL-AB-1.json and -2.json contain two independent interleaved 24-run comparisons against 1.0.3.11. NEXT-32-VALIDATION.json and NEXT-32-ACCURACY.json contain the final 32-image comparison against ONNX FP32. REJECTED-SMALL-* and REJECTED-EXTENDEDINT8-* record failed accuracy experiments. Experimental Winograd/FP16 prototypes under experiments/ are not shipped.

## 1.0.3.13

Batch 1, 640×640, 3 warmups (including startup), alternating control/candidate, single worker per timed inference. Two independent four-image sessions: 48 readings per version each. Final gated-source replay: 31.9475→29.095ms. 32 real fixtures: count/classes preserved, maximum box-edge difference 1.0251px against ONNX FP32. New cache is restricted to NVIDIA Lovelace tensor-int8 mode; unit checks cover disabled modes, unvalidated vendor and idempotence. Official T4/TensorRT FP16 reference is not directly comparable to WebGPU response timings.

## 1.0.3.14

Final production-source A/B: four images, 48 alternating timings/version/session, two independent Chrome runs. Both versions warmed up three times including startup; concurrency one, batch one, 640×640. No shader fallback occurred. Generated K128 shader strings are byte-identical to the fixed-size candidate checked on 32 real fixtures against ONNX FP32 (count/classes match; maximum edge error 1.3461px). Added tests cover 64/128 block selection, small-K fallback, masked FP16 input casts, idempotence, invalid block sizes and worker gating. All 35 suites pass.

## 1.0.3.15 native FP16

Native FP16 mode only: previous/candidate are fp16-full, batch one, 640×640, three warmups, four images, two independent 48-run interleaved sessions. Both have zero custom INT8/Tensor Core guards and no fallback reason. 32-fixture validation used the same final worker source and unchanged model/patcher. Count/classes preserved; maximum box-edge difference versus ONNX FP32 is 0.7127px. Unit tests cover native FP16 activation without matrix support and no INT8-kernel installation, plus all prior FP32/default/vendor guards. 35 suites passed.

## 2.0.1 candidate

36 suites pass. topk-gpu-tests.cjs checks exact shader signatures, shape/sequence/dynamic-offset fallback, repeated buffer/group reuse, cleanup and precision/vendor gating. GPU edge-case tests cover random/equal/negative scores, signed zero, descending/repeated values, FP16 extremes and ties at the 300th boundary. Raw model outputs match 2.0.0 on 32 windows from eight panels of chapter 154. Two final independent interleaved sessions use 48 timings per mode, four representative windows, batch/concurrency one and three warmups. See TOPK-RESULTS.json. Preliminary invalid comparisons are excluded.
