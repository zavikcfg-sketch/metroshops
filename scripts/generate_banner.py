#!/usr/bin/env python3
"""Баннер для Telegram (1200×630). Запуск: python scripts/generate_banner.py"""

from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"


def main() -> None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Установите Pillow: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    ASSETS.mkdir(parents=True, exist_ok=True)
    path = ASSETS / "banner.png"
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), "#050008")
    px = img.load()

    for y in range(h):
        for x in range(w):
            t = math.hypot(x - w * 0.45, y - h * 0.22) / (w * 0.9)
            v = int(42 + min(108, int(168 * math.exp(-t * 4))))
            bx = max(0, min(255, int(35 + x * 0.012)))
            px[x, y] = (bx // 8, bx // 10, max(35, min(165, int(v))))

    draw = ImageDraw.Draw(img)
    try:
        font_big = ImageFont.truetype("arial.ttf", 64)
        font_sub = ImageFont.truetype("arial.ttf", 36)
        font_mini = ImageFont.truetype("arial.ttf", 28)
    except OSError:
        font_big = ImageFont.load_default()
        font_sub = font_big
        font_mini = font_big

    title = "WIXYEZ METRO SHOP"
    subtitle = "Сопровождение · Буст · Снаряжение"
    xy = (72, h // 4 - 20)
    for dx, dy in ((3, 3), (-3, -3), (3, -3), (-3, 3)):
        draw.text((xy[0] + dx, xy[1] + dy), title, fill=(88, 28, 198), font=font_big)
    draw.text(xy, title, fill=(237, 233, 255), font=font_big)
    draw.text((72, xy[1] + 82), subtitle, fill=(196, 181, 232), font=font_sub)
    draw.rounded_rectangle(
        [72, h - 110, 520, h - 46],
        radius=16,
        outline=(148, 120, 255),
        width=2,
    )
    draw.text((96, h - 98), "★ PayCore · 24/7 · Metro Royale", fill=(200, 180, 250), font=font_mini)

    img.save(path, format="PNG", optimize=True)
    print(f"OK: {path}")


if __name__ == "__main__":
    main()
