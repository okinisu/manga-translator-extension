# 2.0.1 — NVIDIA FP16 TopK optimization

- NVIDIA Lovelace native full FP16: replace the fixed 8400→300 packed-half query selection with an exact histogram threshold and stable rank; reduce this TopK sequence from 223 GPU dispatches to 6 (217 fewer).
- Exact generated shader signatures, buffer shape and execution sequence gates preserve unknown paths. Persistent scratch storage and bind groups are reused.
- 32 real windows match 2.0.0 raw scores/boxes and selected detections exactly; eight standalone GPU edge cases pass.
- Two independent 48-run/mode interleaved sessions: pooled response median 31.39→30.32ms (3.4%), mean improves 1.2%. Chapter-level speedup is unmeasured. See TOPK-RESULTS.json.

# 2.0.0 — TensorFlow Lite版

- 文字領域検出をONNX RuntimeからTensorFlow Lite / LiteRT.jsへ移行した版を2.0とします。
- 検証済み1.0.3.15の推論・AI連携・画像処理を引き継ぎます。バージョン改定に伴う処理変更はありません。
- 拡張機能全体の「Tensor Core実験版」という名称を外しました。Tensor Coreを使う個別の推論オプションは引き続き実験扱いです。
- NVIDIAの全体FP16最適化と32画像の検証結果を維持。過去の測定時のバージョン番号は履歴として残しています。

# 1.0.3.15 — 通常FP16モードの最適化

NVIDIA Lovelaceでは **GPU推論精度「全体FP16（AMD／NVIDIA・速度優先）」** を選択してください。FP16の作業用キャッシュ・積和演算・入力変数の最適化を、通常FP16モードでも有効にしました。特殊なsubgroup-matrix／Tensor Core機能は不要です。

4画像・2回の交互計測（各版96回）で、同じ全体FP16モードの1.0.3.14比 **36.03→29.21ms、約18.9%短縮**。32画像の検出数・クラスが一致し、ONNX FP32との位置差は最大 **0.713px**。自動テスト35件通過。今回改善したのは通常FP16モードで、既存の最速INT8実験モードの処理・AMD・既定値は維持しています。公式TensorRTとは実行環境・計測範囲が異なります。詳細はTENSOR-RESULTS.json。

# 1.0.3.14 — K128と入力FP16の追加最適化

NVIDIA Lovelaceの実験用 `tensor-int8` モードを最適化。4画像・2回の交互計測（各版96回）の中央値は **28.90→28.30ms、約2.1%短縮**。32画像の検出数・クラスが一致し、ONNX FP32との位置差は最大1.35px。ブロック行列演算用の追加バッファはワーカーあたり46.3→39.8MB（GPUメモリ全体ではありません）。従来の既定値とAMDの処理は維持しています。公式TensorRTの絶対速度とは実行環境・計測範囲が異なります。詳細はTENSOR-RESULTS.json。

# 1.0.3.13 — FP16作業用キャッシュの最適化

NVIDIA Lovelaceの `tensor-int8` モードでのみ有効。通常モード・AMDは従来どおりです。バッチ1・640×640・ウォームアップ後の交互計測で、1画像は32.16→29.45ms（8.4%）、4画像は32.58→29.08ms（10.7%）。32画像の検出数・クラスが一致し、ONNX FP32との最大位置ずれは1.03px。実測はCPU補助・出力読出しも含むため、公式TensorRTの108FPSとは直接比較できません。詳細はTENSOR-RESULTS.jsonを参照。

# 1.0.3.12 — blockwise INT8 extension

- Preserve the previous 22 INT8 convolutions; add 59 eligible 1x1 convolutions with 64-element block scales and FP32 block summation.
- Support fused residual addition and output-slice groups 1/2/4, including smaller spatial matrices.
- Reject whole-row expansion (accuracy over 3px) and Winograd replacement (no speed gain).
- Two independent 24-run interleaved sessions show a small additional speedup.
- 35 tests pass; 32-image model comparison has identical counts/classes and maximum edge deviation below 0.89px.
- Previous versions and defaults remain intact.

# 1.0.3.11 — INT8 Tensor Core optimization experiment

- Cache quantized weights and per-channel scales on GPU; quantize activations once per input row.
- Reuse input quantization across output tiles and use 32x32 output tiles after an eight-configuration comparison.
- Reuse immutable parameter groups instead of uploading parameters every inference.
- 34 tests pass; 32-image comparison stays within 3px with identical detection counts/classes.
- Two independent benchmark sessions show a small speedup versus ordinary FP16 and roughly halve the previous INT8 time. Defaults remain unchanged.

# 1.0.3.10 — isolated Tensor Core experiment

- Backed up 1.0.3.9 source, models and distribution ZIP before editing.
- Opt-in FP16 matrix and partial INT8/INT32 matrix convolution kernels; unsupported layouts keep LiteRT kernels.
- Capability-gated fallback, persistent GPU packing buffers, debug counters and unchanged defaults.
- 33 existing test suites pass. 32-image model comparison passes the 3px limit for both experimental modes.
- No reliable speed improvement. INT8 mode is slower; ordinary full FP16 remains recommended.

# 1.0.3.9

- 検証済みNVIDIA Lovelaceで全体FP16を選択可能に。RTX4060の交互測定で42.6→36.5ms（約14%短縮）。
- ONNX FP32参照の32画像で検出数・クラス一致、最大座標差2.23px。NVIDIA自動設定はFP32を維持。

# 1.0.3.8

- 不透明・640×640の検出画像をGPUへ直接入力。前処理＋推論がAMD/NVIDIAで約3%短縮。
- 透明度不明・未対応環境は従来の前処理を維持。入力失敗時の復帰、Bitmap/Textureの解放をテスト。

# 1.0.3.7

- 自動・部分FP16の特徴抽出も半精度積和で高速化。780Mの交互測定で110.8→102.3ms（約8%短縮）。
- 32画像で検出数・クラス一致、最大座標差0.75px。全体FP16・FP32・NVIDIAは前回どおり。

# 1.0.3.6

- 全体FP16の畳み込み積和を半精度化。AMD 780Mで86.3→75.6ms（約12%短縮）。
- 32画像で検出数・クラス一致、最大座標差2.63px。自動設定とNVIDIA FP32は維持。

# 1.0.3.5

- AMD RDNA3向け全体FP16を任意設定として追加。自動は部分FP16を維持。
- 780Mの交互測定で111.7→87.8ms（約21%短縮）。32画像でクラス・検出数一致、最大座標差2.66px。
- 全体FP16失敗時はFP32へ再試行。NVIDIAはFP32を維持。

# TFLite GPU experiment 1.0.3.4

- AMD RDNA3 auto: FP16 feature extraction + FP32 head; shared GPU environment and direct intermediate tensor passing. Explicit full FP32 and CPU fallback retained.
- Fix LiteRT 2.5.3 generated FP16 Winograd WGSL: missing f16 directive and mixed coefficient/vector types. Monitor shader compilation/device validation errors and retry FP32 on partial failure.
- Same-run Radeon 780M interleaved medians: 134.28→110.62ms (~17.6%). One image/session, 12 samples per variant, excluding preprocessing/startup; no full-episode timing claim.
- Integrated AMD 32-image results match ONNX FP32 class/count; max box-edge error 0.556px, score delta 0.0183. NVIDIA partial FP16 is disabled due to one integrated class mismatch; full FP32 preserves 32-image class/count.
- Four native CPU split-model outputs are exactly equal to the full model. Full FP32 plus two split models are packaged, increasing artifact size.
- Rejected additional layout-chain, FMA and workgroup tuning candidates. Stable ONNX extension remains unchanged.

# TFLite GPU experiment 1.0.3.3

- Compose 90 single-consumer transpose pairs without changing values or output shapes; graph shrinks 2636→2546 operators.
- Fix reusable GPU input detection: LiteRT imports packed buffer type 26, rather than the previously checked type 20. Record advertised input buffer types; unsupported models retain host input.
- Interleaved 12-sample medians: Radeon 780M 143.35→136.66ms, RTX 4060 46.83→43.27ms. One image/session, four variants resident, requests serialized. No full-episode timing claim.
- Four native CPU inputs remain exactly equal to original TFLite. All 32 images on both GPUs preserve ONNX FP32 detection count/class; max edge differences 0.00025px (NVIDIA), 0.00013px (AMD).
- Reject optional subgroup and FC→1×1-convolution experiments because timing improvement was not established. FP16 runtime stays disabled.

# TFLite GPU experiment 1.0.3.2

- Lower 67 rank-5 tensors to rank 4 and use compatible SUB/STRIDED_SLICE versions after INT64 conversion.
- Explicitly align 87 floating-point broadcast inputs. This fixes GPU output discrepancies in the initial box prediction branch. Use batchDims=0 Gather version 2; runtime decides delegation.
- GPU delegation increases from 180/2604 to 2614/2636 operators on tested RTX 4060 / Chrome 157 Linux Vulkan.
- Four native CPU input outputs remain exactly equal to original TFLite. All 32 browser image detections match ONNX FP32 class/count; maximum box-edge difference 0.00025px, score difference 0.000002.
- Measured FP32 GPU response median 44.6ms, previously 2853ms. Same-run ONNX FP32 77.1ms and partial FP16 47.0ms. One session, two warmups, five measured runs on one image; full-episode speed not measured.
- FP16 runtime execution is disabled after non-finite scores were observed; old FP16 preferences use FP32.
- Shared stable v1.0.3 features retained. Stable ONNX extension is unchanged.
