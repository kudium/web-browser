"""Combine actual native captures for marketplace overviews; requires Pillow."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2] / 'docs/marketplace-hooks/captures'
for name, state in [('listen-article', 'playing'), ('pr-navigator', 'checked'), ('page-explorer', 'sources')]:
    page = Image.open(root / f'{name}-page.png').convert('RGB')
    panel = Image.open(root / f'{name}-{state}.png').convert('RGB')
    canvas = Image.new('RGB', (page.width + panel.width + 16, max(page.height, panel.height)), '#202020')
    canvas.paste(page, (0, 0))
    canvas.paste(panel, (page.width + 16, 0))
    canvas.save(root / f'{name}-overview.png', optimize=True)

# Keep a compact, reproducible listening gallery alongside the PNG masters.
import hashlib
import json
manifest = json.loads((root / 'manifest.json').read_text())
for name, states in [('listen-article', ['overview', 'settings', 'transcript']),
                     ('pr-navigator', ['overview', 'checked']),
                     ('page-explorer', ['overview', 'outline', 'sources'])]:
    assets = []
    for state in states:
        source = root / f'{name}-{state}.png'
        picture = Image.open(source).convert('RGB')
        picture.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        output = source.with_suffix('.webp')
        quality = 85
        while True:
            picture.save(output, 'WEBP', quality=quality, method=6)
            if output.stat().st_size <= 250000 or quality <= 40:
                break
            quality -= 5
        assert output.stat().st_size <= 250000, output
        assets.append(dict(file=output.name, width=picture.width, height=picture.height,
                           bytes=output.stat().st_size,
                           sha256=hashlib.sha256(output.read_bytes()).hexdigest()))
    key = 'listeningGallery' if name == 'listen-article' else name + 'Gallery'
    manifest[key] = dict(packageSHA256=hashlib.sha256((root.parent / (name + '.json')).read_bytes()).hexdigest(), assets=assets)
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
