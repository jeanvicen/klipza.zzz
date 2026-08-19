from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
source = Image.open(ROOT / 'assets' / 'klipza-mark.png').convert('RGBA')

for size, filename in ((192, 'icon-192.png'), (512, 'icon-512.png'), (1024, 'icon-1024.png')):
    source.resize((size, size), Image.Resampling.LANCZOS).save(ROOT / 'assets' / filename, optimize=True)

android_res = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
if android_res.exists():
    density_sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for density, size in density_sizes.items():
        target = source.resize((size, size), Image.Resampling.LANCZOS)
        for name in ('ic_launcher.png', 'ic_launcher_round.png'):
            target.save(android_res / f'mipmap-{density}' / name, optimize=True)

    foreground = source.copy()
    pixels = foreground.load()
    for y in range(foreground.height):
        for x in range(foreground.width):
            r, g, b, a = pixels[x, y]
            if r > 245 and g > 245 and b > 245:
                pixels[x, y] = (255, 255, 255, 0)
    foreground.resize((432, 432), Image.Resampling.LANCZOS).save(android_res / 'drawable' / 'ic_launcher_foreground.png')
    for density, size in density_sizes.items():
        foreground.resize((size, size), Image.Resampling.LANCZOS).save(android_res / f'mipmap-{density}' / 'ic_launcher_foreground.png', optimize=True)
    old_vector = android_res / 'drawable-v24' / 'ic_launcher_foreground.xml'
    if old_vector.exists():
        old_vector.unlink()

print('Ícones Klipza atualizados para PWA e Android a partir da marca oficial.')
