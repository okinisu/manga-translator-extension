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

### Requirements and distribution differences

Use desktop Chrome and the complete extension folder, including model weights. A GPU is optional; CPU-only detection is supported. Node.js and Python are not required for browser-based translation. Pi integration requires Node.js 22.19+, Pi and the running bridge on the same PC as Chrome.

The existing v1.0.0 release ZIP supports ChatGPT/Gemini browser automation. To use Pi, install the main branch source below. Both currently show extension version 1.0.0, so the version number alone does not identify Pi support.

### Release ZIP (browser providers)

Download and extract the dedicated extension ZIP from [Releases](https://github.com/okinisu/manga-translator-extension/releases/latest). In chrome://extensions, enable Developer mode, choose Load unpacked and select the extracted folder. Reload existing comic and AI pages.

For updates, replace the files in the same folder currently loaded by Chrome, reload the extension, then reload comic and AI pages. Loading from another folder can create a separate extension with separate settings. See the [testing guide](TESTING.md#english).

### Main branch source (includes Pi)

Install Git and [Git LFS](https://git-lfs.com/), then run the following in a terminal. Shell examples use Linux/macOS bash or zsh:

~~~sh
git lfs install
git clone https://github.com/okinisu/manga-translator-extension.git "$HOME/Downloads/manga-translator-extension"
cd "$HOME/Downloads/manga-translator-extension"
git lfs pull
~~~

In `chrome://extensions`, enable Developer mode and load `~/Downloads/manga-translator-extension`, the folder containing `manifest.json`, using Load unpacked. Opening `popup.html` as a local file does not run it as an extension. GitHub-generated source archives may contain model pointers; dedicated release ZIPs include actual model weights.

For Windows PowerShell, use `"$HOME\Downloads\manga-translator-extension"` instead of `"$HOME/Downloads/manga-translator-extension"`, adjusting it to your actual checkout location.

To update a source checkout, run the following from its root folder after saving or resolving any local changes:

~~~sh
git pull --ff-only
git lfs pull
~~~

Reload the extension and comic/AI pages in Chrome. For Pi, stop the old bridge and restart it from the updated folder, then paste the newly generated Connection key into the extension.

## Use

For browser providers, sign in to ChatGPT or Gemini. For Pi, complete the [Pi setup](PI.md#english-setup) and start the bridge first. Open an episode on NAVER WEBTOON, select source/target languages, AI and batch mode, then click the automatic translation button. The first completed collage is submitted while the remaining images are prepared. When streaming text is available, complete items are previewed during generation and confirmed against the final reply. Missing IDs use retry collages of up to 12 regions, with at most three retries per ID. If IDs remain missing, translation stops while retaining accepted items. Manual image/prompt preparation and JSON import are also available.

The AI is asked to return IDs and translations without source text. Legacy replies containing original text remain supported. Provisional overlays are not persisted and disappear on comic-page reload.

## Settings

- Japanese/English UI, selectable source/target languages.
- Accuracy, balanced (default), or fewer-image batch modes.
- Translation memory / custom instructions: up to 4,000 characters, saved automatically on this device across titles. Frozen when episode preparation starts, reused for all batches/retries. Clear the field to disable future use. Included in prompts to the selected AI. No automatic learning from previous translations.
- ChatGPT temporary chat (default) or normal chat.
- Pi connection key, image-capable model discovery/selection, and thinking level (Pi default or off through max). Supported levels depend on the model.
- GPU with CPU fallback (default) or CPU only, FP32/partial FP16.
- Graph Capture auto/off/on. Auto enables it only for AMD with partial FP16; failed startup checks retry without it. FP32 always uses Capture off.
- Detection diagnostics. Browser providers also show mean/last response times in the AI panel; those statistics do not cover Pi requests.

## Development

Requires Node.js, Python 3 and Git LFS. Run the commands from the repository root.

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

Install Node.js 22.19+ with npm, then run these commands from any terminal folder. See the [official Pi installation guide](https://github.com/earendil-works/pi#getting-started) for alternatives:

~~~sh
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
pi
~~~

Enter `/login` inside Pi and authenticate with your chosen provider. Then open another terminal and **change into this extension's root folder containing `manifest.json` and `scripts/`**. If you cloned it to `~/Downloads/manga-translator-extension`:

~~~sh
cd "$HOME/Downloads/manga-translator-extension"
node scripts/pi-bridge.mjs
~~~

Replace the path with your actual clone/extraction folder. Startup automatically prints `Connection key: ...`; paste that key into the extension's Pi connection settings. This is separate from the provider's login code or API key. Keep the bridge terminal open during translation.

[Complete Pi installation, login and connection-key guide](PI.md#english-setup)
