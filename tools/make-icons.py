# Draws the app icon: an arcade-red cartridge with a lit marquee label on the cabinet brown.
# python3 tools/make-icons.py   (needs Pillow)
from PIL import Image, ImageDraw
def icon(size):
    s = size / 512
    im = Image.new('RGB', (size, size), '#17110d')
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([116*s, 96*s, 396*s, 420*s], radius=20*s, fill='#e2412f')
    d.rectangle([116*s, 396*s, 396*s, 420*s], fill='#a82c1f')           # bevel
    d.rectangle([156*s, 136*s, 356*s, 280*s], fill='#ffb43c')           # lit label
    for y in range(int(140*s), int(280*s), max(1, int(8*s))):           # marquee scanlines
        d.line([156*s, y, 356*s, y], fill='#f39a2c', width=max(1, int(2*s)))
    for i in range(6):
        x = 150*s + i*40*s
        d.rectangle([x, 340*s, x+20*s, 396*s], fill='#f6e8cc')
    return im
for name, size in [('icon-512', 512), ('icon-192', 192), ('apple-touch-icon', 180), ('favicon-32', 32)]:
    icon(size).save(f'icons/{name}.png')
