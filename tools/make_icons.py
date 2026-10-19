"""Genera los íconos de la PWA (192, 512, maskable, apple-touch, favicon SVG).

Diseño: fondo #0f172a, ondas concéntricas suaves en degradado celeste→índigo
y un punto central (la mente en calma).
Uso:  npm run build:icons
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"
BG = (15, 23, 42)
SKY = (56, 189, 248)
INDIGO = (129, 140, 248)


def mix(a, b, k):
    return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))


def draw(size: int, safe: float) -> Image.Image:
    """safe = fracción del lienzo que ocupa el dibujo (maskable necesita margen)."""
    s = size * 4  # supermuestreo para bordes suaves
    img = Image.new("RGB", (s, s), BG)
    glow = Image.new("RGB", (s, s), BG)
    g = ImageDraw.Draw(glow)
    c = s / 2
    r_max = s * safe / 2
    g.ellipse([c - r_max * 0.55, c - r_max * 0.55, c + r_max * 0.55, c + r_max * 0.55], fill=mix(BG, INDIGO, 0.35))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.06))
    img.paste(glow)

    d = ImageDraw.Draw(img)
    rings = 4
    for i in range(rings):
        k = i / (rings - 1)
        r = r_max * (0.34 + 0.66 * k)
        width = max(2, round(s * (0.03 - 0.012 * k)))
        color = mix(SKY, INDIGO, k)
        color = mix(BG, color, 1 - 0.45 * k)
        d.ellipse([c - r, c - r, c + r, c + r], outline=color, width=width)
    dot = r_max * 0.15
    d.ellipse([c - dot, c - dot, c + dot, c + dot], fill=SKY)
    return img.resize((size, size), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0f172a"/>
<g fill="none" stroke-width="3">
<circle cx="32" cy="32" r="10" stroke="#38bdf8"/>
<circle cx="32" cy="32" r="18" stroke="#6aa6f8" opacity=".8"/>
<circle cx="32" cy="32" r="26" stroke="#818cf8" opacity=".55"/>
</g>
<circle cx="32" cy="32" r="4" fill="#38bdf8"/>
</svg>
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192, 0.86).save(OUT / "icon-192.png", optimize=True)
    draw(512, 0.86).save(OUT / "icon-512.png", optimize=True)
    draw(512, 0.66).save(OUT / "maskable-512.png", optimize=True)  # zona segura 80 %
    draw(180, 0.8).save(OUT / "apple-touch-icon.png", optimize=True)
    (OUT / "favicon.svg").write_text(SVG, encoding="utf-8")
    print("Íconos listos en", OUT)


if __name__ == "__main__":
    main()
