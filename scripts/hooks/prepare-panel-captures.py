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
