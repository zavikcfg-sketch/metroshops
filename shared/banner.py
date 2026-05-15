"""Генерация баннера для /start (без ручного запуска скриптов)."""

from __future__ import annotations

import logging
import math
from pathlib import Path

logger = logging.getLogger(__name__)


def generate_banner(path: Path) -> bool:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        logger.warning("Pillow не установлен — баннер не создан. pip install Pillow")
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1200, 630
    img = Image.new("RGB", (w, h), "#050008")
    px = img.load()

    for y in range(h):
        for x in range(w):
            t = math.hypot(x - w * 0.5, y - h * 0.18) / (w * 0.85)
            glow = int(55 + min(120, int(175 * math.exp(-t * 3.5))))
            px[x, y] = (18, 6, min(200, glow))

    draw = ImageDraw.Draw(img, "RGBA")
    draw.ellipse([780, 40, 1080, 340], fill=(120, 60, 200, 90))
    draw.ellipse([820, 80, 1020, 280], fill=(200, 180, 255, 40))

    try:
        font_big = ImageFont.truetype("arial.ttf", 58)
        font_sub = ImageFont.truetype("arial.ttf", 34)
        font_tag = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        try:
            font_big = ImageFont.truetype("segoeui.ttf", 54)
            font_sub = ImageFont.truetype("segoeui.ttf", 32)
            font_tag = ImageFont.truetype("segoeui.ttf", 24)
        except OSError:
            font_big = ImageFont.load_default()
            font_sub = font_big
            font_tag = font_big

    title = "WIXYEZ METRO SHOP"
    subtitle = "Самый качественный Metro Shop · PUBG Mobile"
    badge = "Сопровождение  ·  Буст  ·  Снаряжение  ·  24/7"

    xy = (64, 200)
    for dx, dy in ((4, 4), (-4, -4), (4, -4), (-4, 4)):
        draw.text((xy[0] + dx, xy[1] + dy), title, fill=(70, 20, 160, 255), font=font_big)
    draw.text(xy, title, fill=(245, 240, 255, 255), font=font_big)
    draw.text((64, xy[1] + 76), subtitle, fill=(190, 170, 235, 255), font=font_sub)

    draw.rounded_rectangle(
        [64, 430, 620, 500],
        radius=18,
        fill=(40, 15, 90, 200),
        outline=(160, 120, 255, 255),
        width=2,
    )
    draw.text((88, 448), badge, fill=(220, 200, 255, 255), font=font_tag)
    draw.text((64, 520), "★ PayCore  ·  Гарантия выноса  ·  Metro Royale", fill=(150, 130, 200, 255), font=font_tag)

    img.save(path, format="PNG", optimize=True)
    logger.info("Баннер создан: %s", path)
    return True


def ensure_banner(path: Path) -> Path:
    if not path.is_file():
        generate_banner(path)
    return path
