# TFLite models

Source: [ogkalu/comic-text-and-bubble-detector](https://huggingface.co/ogkalu/comic-text-and-bubble-detector), RT-DETR-v2 R50-vd derivative. Existing trained weights are retained; no retraining.

- vendor/litert/detector_optimized.tflite: complete FP32 model, used for CPU, explicit FP32 and fallback. Input float32 NHWC [1,640,640,3], RGB /255; outputs [1,300,3] class scores and [1,300,4] normalized xyxy boxes.
- vendor/litert/detector_backbone.tflite: feature extraction ending at tf.concat_4/concat, 232 operators, same image input, float32 interface [1,8400,256]. GPU runtime precision is FP16 on validated AMD RDNA3.
- vendor/litert/detector_head.tflite: remaining 2314 operators, input [1,8400,256], original scores/boxes outputs. Runtime precision FP32.

The full graph uses compact INT32 row Gather, rank <=4, compatible SUB/slice versions, 87 explicitly aligned broadcast inputs and 90 composed transpose pairs. Split and full CPU FP32 raw outputs match exactly on four fixture tensors. GPU FP16 execution changes numeric values; it is not INT8 quantization or exact FP32 equivalence.

Runtime @litertjs/core 2.5.3 is bundled locally. litert-gpu-core.js applies the missing f16 enable directive and explicit f32 casts of At_buffer/Bt_buffer coefficients in mixed FP16/FP32 Winograd transforms. Patches are feature-gated, idempotent and accompanied by shader compilation/device error checks. Unsupported partial execution retries full FP32. GPU buffer type 26 is reused where advertised; intermediate tensors are directly passed between compiled models.

Automatic partial FP16 is gated to amd/rdna-3 with shader-f16. NVIDIA partial FP16 was rejected due to an integrated class mismatch; automatic mode remains full FP32. TFLITE-OPTIMIZATION.json binds all three model hashes and records validation scope. Development conversion scripts/evidence are excluded from installable ZIPs; source images are never bundled.

Optional `fp16-full` executes the existing optimized whole graph in FP16 on validated AMD RDNA3 or NVIDIA Lovelace. No additional weights are shipped. Automatic mode remains split FP16/FP32. A failed full-FP16 startup or run retries FP32. 32 integrated GPU fixtures matched ONNX FP32 classes/counts, maximum edge difference 2.6637px.

Full-FP16 option additionally patches matched packed-half convolution shaders to f16 FMA accumulators; outputs retain FP32 conversion and existing packed storage. This changes arithmetic rounding, not model weights. Enabled only with fullFP16.halfConvolution.validated; unsupported shader patterns remain unchanged. Shader compilation/device validation guards and FP32 retry remain active.

1.0.3.7 enables the same half-convolution shader transformation in the automatic/explicit partial-FP16 backbone, gated independently by partialFP16.halfConvolution.validated. The head remains FP32. GPU evidence: 32 images, equal classes/counts, maximum edge error 0.751526px and score error 0.007118. Model weights and tensor interfaces are unchanged.

1.0.3.8 adds a separate FP32 GPU RGB normalization pass into the existing packed-input GPUBuffer. It requires the caller to mark a known-opaque 640×640 bitmap and a validated adapter. Chapter windows are composited over white before resizing. Unknown-alpha inputs remain CPU-normalized because transparent unpremultiplication can differ by one byte between Canvas and GPU copies. Opaque all-256-level probes matched CPU float32 values exactly. No resize algorithm or model weights changed.

1.0.3.9 enables opt-in full FP16 on NVIDIA Lovelace after32-image GPU validation: counts/classes match ONNX FP32, maximum integrated edge error2.228333px, score difference0.038263. Automatic NVIDIA precision remains FP32; partial NVIDIA precision remains disabled. No weights or shader algorithms changed in this release.

## Experimental GPU matrix kernels (1.0.3.12)

Disk weights and graph files are unchanged. The previous 22 per-row/per-channel INT8 convolutions remain intact. A separate block-tensor.js handles 59 additional convolutions using 64-element scales, signed INT8 multiplication, INT32 accumulation and FP32 summation across blocks. Grouped packed layouts and residual-add-plus-ReLU are supported. Other operations retain LiteRT behavior. See TENSOR-RESULTS.json for model agreement and timing evidence.
