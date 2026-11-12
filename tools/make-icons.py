# Draws a simple cartridge icon. python3 tools/make-icons.py
from PIL import Image, ImageDraw
def icon(size):
    s = size / 512
    im = Image.new('RGB', (size, size), '#111827')
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([116*s, 96*s, 396*s, 420*s], radius=24*s, fill='#6366f1')
    d.rectangle([156*s, 136*s, 356*s, 280*s], fill='#e0e7ff')
    for i in range(6):
        x = 150*s + i*40*s
        d.rectangle([x, 360*s, x+20*s, 420*s], fill='#fbbf24')
    return im
for name, size in [('icon-512', 512), ('icon-192', 192), ('apple-touch-icon', 180), ('favicon-32', 32)]:
    icon(size).save(f'icons/{name}.png')
