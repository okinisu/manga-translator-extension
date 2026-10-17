"""Build the extension ZIP; this command never publishes to GitHub."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = '''manifest.json popup.html popup.css popup.js review.html review.js ui.css
pi-client.js ui-i18n.js core.js text-core.js collage-core.js batch-store.js background.js
comic.js chat.js automation.js gemini-dom.js detector.js detector-worker.js litert-gpu-core.js topk-gpu-core.js tensor-convolution.js block-tensor.js gpu-input-core.js nhwc-pixel-core.js
TFLITE-OPTIMIZATION.json TENSOR-RESULTS.json TOPK-RESULTS.json benchmark.html benchmark.js postprocess-core.js performance-core.js crop-worker.js region-image.js color-core.js episode-cache.js debug-core.js debug-ui.js debug.css
vendor/MODEL-LICENSE vendor/MODEL-NOTICES.txt PRIVACY.md THIRD_PARTY_NOTICES.md README.md README.en.md MODEL.md CHANGELOG.md TESTING.md PI.md scripts/pi-bridge.mjs'''.split()


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def build(destination):
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    config = json.loads((ROOT / 'TFLITE-OPTIMIZATION.json').read_text())
    if config.get('validated') is not True or digest(ROOT / 'vendor/litert/detector_optimized.tflite') != config['sha256']:
        raise ValueError('TFLite model validation or hash mismatch')
    partial = config.get('partialFP16', {})
    if partial.get('validated') is not True:
        raise ValueError('Partial FP16 validation missing')
    for part in ['backbone', 'head']:
        if digest(ROOT / partial[part]['file']) != partial[part]['sha256']:
            raise ValueError(f'Partial {part} model hash mismatch')
    members = set(RUNTIME)
    members.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'vendor/litert').rglob('*') if p.is_file() and p.name not in {'detector_fp32.tflite','model-config.json'})
    members.update(p.relative_to(ROOT).as_posix() for p in (ROOT / 'icons').glob('*.png'))
    if (ROOT / 'LICENSE').exists():
        members.add('LICENSE')
    for name in members:
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing or symlinked runtime resource: {name}')
        if path.suffix in {'.onnx', '.tflite'}:
            with path.open('rb') as stream:
                if stream.read(128).startswith(b'version https://git-lfs.github.com/spec/v1'):
                    raise ValueError(f'Git LFS pointer instead of model weights: {name}; run git lfs pull')
    required = {manifest['background']['service_worker'], manifest['action']['default_popup']}
    required.update(manifest['icons'].values())
    required.update(manifest['action']['default_icon'].values())
    for entry in manifest.get('content_scripts', []):
        required.update(entry.get('js', []))
        required.update(entry.get('css', []))
    for name in members:
        if name.endswith('.html'):
            required.update(re.findall(r'(?:src|href)=["\']([^"\']+)["\']', (ROOT / name).read_text()))
        if name.endswith('.js') and '/' not in name:
            # Validate literal root-level JS imports/worker resources. All LiteRT
            # vendor resources are packaged together for runtime-selected WASM.
            required.update(re.findall(r'["\']([A-Za-z0-9_-]+\.js)["\']', (ROOT / name).read_text()))
    missing = required - members
    if missing:
        raise ValueError(f'Unpackaged local resources: {sorted(missing)}')
    if any('tests.cjs' in name or 'VALIDATION' in name or name.startswith(('conversion/', '.git/')) for name in members):
        raise ValueError('Development/private files in runtime allowlist')
    destination.mkdir(parents=True, exist_ok=True)
    archive = destination / f'manga-translator-{manifest["version"]}.zip'
    inventory = [{'path': name, 'bytes': (ROOT / name).stat().st_size, 'sha256': digest(ROOT / name)} for name in sorted(members)]
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as package:
        for name in sorted(members):
            package.write(ROOT / name, name)
    with zipfile.ZipFile(archive) as package:
        bad = package.testzip()
        if bad:
            raise ValueError(f'Corrupt ZIP member: {bad}')
        assert 'manifest.json' in package.namelist()
    checksum = digest(archive)
    report = {
        'version': manifest['version'], 'artifact': archive.name, 'sha256': checksum,
        'archiveBytes': archive.stat().st_size, 'files': inventory,
        'originalCodeLicense': 'selected; see LICENSE' if 'LICENSE' in members else 'not selected; see THIRD_PARTY_NOTICES.md',
        'status': 'packaged; automated checks recorded in TEST-RESULTS.json; live AI DOM behavior requires manual verification',
        'excluded': ['original ONNX assets', 'baseline TFLite model', 'tests', 'conversion scripts', 'validation reports', 'Git history', 'user images/accounts'],
    }
    (destination / 'PACKAGE-REPORT.json').write_text(json.dumps(report, indent=2) + '\n')
    (destination / 'SHA256SUMS').write_text(f'{checksum}  {archive.name}\n')
    print(json.dumps({key: report[key] for key in ['version', 'artifact', 'archiveBytes', 'sha256', 'originalCodeLicense']}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    build(parser.parse_args().output.resolve())
