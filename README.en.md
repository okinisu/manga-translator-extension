# Manga Translator 1.0

[日本語](README.md) · [Download](https://github.com/okinisu/manga-translator-extension/releases/latest) · [Testing](TESTING.md#english) · [Report a bug](https://github.com/okinisu/manga-translator-extension/issues/new/choose)

A Chrome extension that detects text regions locally on NAVER WEBTOON, creates numbered crop collages, asks ChatGPT, Gemini or a provider connected through local Pi to read and translate them, and overlays the translations on the comic.

## Use at your own risk

**Use this extension at your own risk and responsibility.** Check the terms of the AI services and content platforms you use, and ensure you have the necessary rights to the content. Translation accuracy, continued operation of automation, and account safety are not guaranteed.

## Free tiers and costs

You can try supported connections without a paid subscription:

- **Gemini API:** eligible models offer a Free Tier with model/project limits. Configure a Gemini API key in Pi, then select Pi and an image-capable Gemini model in the extension. The extension has no direct API-key input field.
- **Codex and other providers through Pi:** Pi has no inference allowance of its own; it uses the connected service's free tier or existing subscription/API allowance. Codex is included in ChatGPT Free, subject to account availability and limits. Follow the [Pi setup guide](PI.md).

Not every model listed by Pi is free. Paid API settings or subscription plans may incur charges. Eligibility and quotas can change; check [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini API billing](https://ai.google.dev/gemini-api/docs/billing), [Codex plans and limits](https://learn.chatgpt.com/docs/pricing), and your account's current usage.

## Install

Download and extract the dedicated extension ZIP from [Releases](https://github.com/okinisu/manga-translator-extension/releases/latest). In chrome://extensions, enable Developer mode, choose Load unpacked and select the extracted folder. Reload existing comic and AI pages.

For updates, replace the files in the same folder currently loaded by Chrome, reload the extension, then reload comic and AI pages. Loading from another folder can create a separate extension with separate settings. See the [testing guide](TESTING.md#english).

For source installation, clone this repository, run git lfs pull, and load the repository root. GitHub-generated source archives may contain model pointers; use the dedicated release ZIP for bundled model weights.

## Use

Sign in to your chosen AI, open an episode on NAVER WEBTOON, select source/target languages, AI and batch mode, then click the automatic translation button. The first completed collage is submitted while the remaining images are prepared. Complete items are previewed during generation and confirmed against the final reply. Missing IDs use retry collages of up to 12 regions, with at most three retries per ID. Manual image/prompt preparation and JSON import are also available.

The AI is asked to return IDs and translations without source text. Legacy replies containing original text remain supported. Provisional overlays are not persisted and disappear on comic-page reload.

## Settings

- Japanese/English UI, selectable source/target languages.
- Accuracy, balanced (default), or fewer-image batch modes.
- Translation memory / custom instructions: up to 4,000 characters, saved automatically on this device across titles. Frozen when episode preparation starts, reused for all batches/retries. Clear the field to disable future use. Included in prompts to the selected AI. No automatic learning from previous translations.
- ChatGPT temporary chat (default) or normal chat.
- Pi connection key, image-capable model discovery/selection, and thinking level (Pi default or off through max). Supported levels depend on the model.
- GPU with CPU fallback (default) or CPU only, FP32/partial FP16.
- Graph Capture auto/off/on. Auto enables it only for AMD with partial FP16; failed startup checks retry without it. FP32 always uses Capture off.
- Detection diagnostics and mean/last AI response times in the AI panel.

## Development

Requires Node.js, Python 3 and Git LFS.

~~~sh
git lfs pull
python3 scripts/test_extension.py
python3 scripts/package_extension.py --output dist
~~~

Includes 31 test suites plus JavaScript syntax checks. Tests cover simulated DOM/message flows, not every live AI-site behavior or model-accuracy case. AI site changes and account limits can interrupt automation.

See [MODEL.md](MODEL.md), [PRIVACY.md](PRIVACY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). No license has been selected for original code. Third-party licenses remain applicable. This is not an official ChatGPT, Gemini, NAVER or Chrome product. Service terms and content rights apply separately.

Version 1.0.0 is the starting point of this repository history and public testing. Report problems through [Issues](https://github.com/okinisu/manga-translator-extension/issues/new/choose). See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance.

### Pi / Codex local connection

Pi integration is currently available in the main branch source. The existing 1.0.0 release ZIP does not include it; use the source installation instructions above.

[Pi連携の設定 / Setup guide](PI.md)
