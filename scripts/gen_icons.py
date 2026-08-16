#!/usr/bin/env python3
"""Generate PWA icons (PNG) from the app mark. Requires Pillow: `python3 -m pip install pillow`.

Usage: python3 scripts/gen_icons.py
Writes public/pwa-192x192.png, public/pwa-512x512.png, public/apple-touch-icon.png
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public"

BLUE = (61, 125, 192, 255)
WHITE = (255, 255, 255, 255)
AMBER = (255, 176, 32, 255)


def draw_mark(size: int, radius_frac: float = 14 / 64, pad_frac: float = 0.0) -> Image.Image:
    """Same geometry as favicon.svg (64x64 grid), scaled to `size` with a safe padding for maskable icons."""
    scale = 8
    big = size * scale
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(big * pad_frac)
    box = big - 2 * pad
    unit = box / 64.0
    r = int(box * radius_frac)
    d.rounded_rectangle([pad, pad, pad + box, pad + box], radius=r, fill=BLUE)
    lw = max(1, int(3 * unit))

    def rect(x, y, w, h):
        d.rectangle([pad + x * unit, pad + y * unit, pad + (x + w) * unit, pad + (y + h) * unit], outline=WHITE, width=lw)

    def line(x1, y1, x2, y2):
        d.line([pad + x1 * unit, pad + y1 * unit, pad + x2 * unit, pad + y2 * unit], fill=WHITE, width=lw)

    rect(12, 10, 40, 44)
    line(12, 32, 52, 32)
    line(32, 10, 32, 32)
    cx, cy, rr = 44 * unit + pad, 44 * unit + pad, 6 * unit
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=AMBER)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    draw_mark(192).save(OUT / "pwa-192x192.png")
    # 512 doubles as the maskable icon: keep content inside the ~80% safe zone
    draw_mark(512, pad_frac=0.08).save(OUT / "pwa-512x512.png")
    apple = draw_mark(180, radius_frac=0.0)  # iOS applies its own mask
    bg = Image.new("RGBA", apple.size, BLUE)
    bg.alpha_composite(apple)
    bg.convert("RGB").save(OUT / "apple-touch-icon.png")
    print("wrote", sorted(p.name for p in OUT.glob("*.png")))


if __name__ == "__main__":
    main()
