"""Prepare website assets from actual Electron captures. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

root = Path(__file__).resolve().parents[3]
product = root / 'apps/web/public/product'
demo = product / 'demo'
frames = Path(__file__).parent / 'frames'

for filename in demo.glob('*.png'):
    Image.open(filename).convert('RGB').save(filename.with_suffix('.webp'), quality=93)


def save(source, target):
    source.save(product / target, quality=95)


def device(source, frame, box, target):
    screenshot = Image.open(demo / source).convert('RGB')
    border = Image.open(frames / frame).convert('RGBA')
    x, y, width, height = box
    fitted = ImageOps.fit(screenshot, (width, height), centering=(.5, 0))
    canvas = Image.new('RGBA', border.size)
    canvas.paste(fitted, (x, y))
    save(Image.alpha_composite(canvas, border), target)

workspace = Image.open(demo / 'design-workspace.png').convert('RGB')
editor = Image.open(demo / 'project-editor-light.png').convert('RGB')
ai = Image.open(demo / 'ai-context.png').convert('RGB')
save(workspace, 'browser.webp')
save(editor, 'editor.webp')
save(workspace.crop((0, 130, 600, 1800)), 'workspace-detail.webp')
save(editor.crop((40, 100, editor.width - 40, editor.height - 60)), 'editor-detail.webp')
# Sidebar occupies the right edge of the 1440px window, captured at 2x scale.
save(ai.crop((ai.width - 736, 80, ai.width - 16, ai.height - 16)), 'assistant.webp')
device('design-workspace.png', 'macbook.png', (74, 18, 652, 414), 'kudium-macbook.webp')
device('ai-context.png', 'macbook.png', (74, 18, 652, 414), 'kudium-ai-macbook.webp')
device('developer-files.png', 'imac.png', (20, 22, 760, 424), 'kudium-imac.webp')
print('Prepared website WebP images and device mockups.')

# Focused feature-card crops. Keep screenshot content intact; no UI reconstruction.
save(workspace.crop((16, 180, 584, 760)), 'highlight-workspaces.webp')
save(ai.crop((ai.width - 736, 1260, ai.width - 16, ai.height - 16)), 'highlight-ai.webp')
terminal = Image.open(demo / 'developer-terminal.png').convert('RGB')
save(terminal.crop((terminal.width - 716, 1390, terminal.width - 44, terminal.height - 36)), 'highlight-developer.webp')

# Close-ups from the same workspace, including the real address-bar popover.
expanded = Image.open(demo / 'sidebar-expanded.png').convert('RGB')
picker = Image.open(demo / 'address-group-picker.png').convert('RGB')
focused_favorites = Image.open(demo / 'favorites-workspace.png').convert('RGB')
save(focused_favorites.crop((16, 92, 584, 390)), 'favorites-detail.webp')
# Isolate the captured toolbar and rounded popover from the webpage behind it.
# Preserve every UI pixel inside these bounds; only the outer background is masked.
picker_detail = picker.crop((286, 86, 930, 794)).convert('RGBA')
mask = Image.new('L', picker_detail.size, 0)
shape = ImageDraw.Draw(mask)
shape.rectangle((0, 0, 644, 66), fill=255)
shape.rounded_rectangle((0, 66, 643, 707), radius=26, fill=255)
picker_detail.putalpha(mask)
save(picker_detail, 'address-picker-detail.webp')
