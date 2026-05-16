"""Тематический баннер Metro Royale для Telegram (1200×630)."""

from __future__ import annotations

import logging
import math
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

BANNER_VERSION = "4"
_ROOT = Path(__file__).resolve().parent.parent
_FONT_DIR = _ROOT / "assets" / "fonts"
_FONT_FILE = _FONT_DIR / "DejaVuSans-Bold.ttf"
_FONT_URL = (
    "https://github.com/dejavu-fonts/dejavu-fonts/raw/version_2_37/ttf/DejaVuSans-Bold.ttf"
)


def _download_font() -> bool:
    try:
        _FONT_DIR.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(_FONT_URL, _FONT_FILE)
        return _FONT_FILE.is_file()
    except Exception as exc:
        logger.warning("Не удалось скачать шрифт для баннера: %s", exc)
        return False


def _load_font(size: int):
    from PIL import ImageFont

    candidates = [
        _FONT_FILE,
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"),
        Path("C:/Windows/Fonts/segoeuib.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    if not _FONT_FILE.is_file():
        _download_font()

    for fp in candidates:
        if fp.is_file():
            try:
                return ImageFont.truetype(str(fp), size)
            except OSError:
                continue
    return ImageFont.load_default()


def _lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def _draw_background(px, w: int, h: int) -> None:
    for y in range(h):
        for x in range(w):
            ny = y / h
            nx = x / w
            base = (
                _lerp(8, 22, ny),
                _lerp(4, 12, ny),
                _lerp(28, 75, ny),
            )
            glow = math.exp(-((x - w * 0.72) ** 2 + (y - h * 0.22) ** 2) / (w * 110) ** 2)
            moon = int(90 * glow)
            tunnel = max(0.0, 1.0 - abs(nx - 0.38) * 2.2) * (1.0 - ny * 0.6)
            metro = int(35 * tunnel * (0.4 + 0.6 * math.sin(x * 0.04)))
            px[x, y] = (
                min(255, base[0] + moon // 3 + metro // 2),
                min(255, base[1] + moon // 4),
                min(255, base[2] + moon + metro),
            )


def _draw_metro_floor(draw, w: int, h: int) -> None:
    horizon = int(h * 0.58)
    for i in range(14):
        t = i / 13
        y = int(horizon + (h - horizon) * t * t)
        color = (90 + i * 8, 40 + i * 4, 160 + i * 6, int(40 + 100 * t))
        draw.line([(0, y), (w, y)], fill=color, width=1)
    for i in range(-8, 9):
        x0 = w // 2 + i * 55
        draw.line([(x0, horizon), (w // 2 + i * 130, h)], fill=(70, 30, 140, 90), width=1)


def _draw_moon(draw, cx: int, cy: int, r: int) -> None:
    for ring in range(5, 0, -1):
        alpha = 18 + ring * 10
        draw.ellipse(
            [cx - r - ring * 14, cy - r - ring * 14, cx + r + ring * 14, cy + r + ring * 14],
            fill=(140, 80, 220, alpha),
        )
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(235, 225, 255, 240))
    draw.ellipse([cx - r // 3, cy - r // 4, cx + r // 2, cy + r // 2], fill=(200, 185, 240, 80))


def _draw_plaque(draw, x: int, y: int, pw: int, ph: int) -> None:
    draw.rounded_rectangle(
        [x, y, x + pw, y + ph],
        radius=22,
        fill=(25, 10, 55, 230),
        outline=(180, 140, 255, 255),
        width=3,
    )
    draw.rounded_rectangle(
        [x + 8, y + 8, x + pw - 8, y + ph - 8],
        radius=16,
        outline=(120, 70, 200, 120),
        width=1,
    )
    for sx in range(x + 30, x + pw - 30, 40):
        draw.line([(sx, y + 12), (sx, y + ph - 12)], fill=(100, 60, 180, 60), width=1)


def _draw_gear_icons(draw, ox: int, oy: int) -> None:
    # Рюкзак
    draw.rounded_rectangle(
        [ox, oy + 30, ox + 70, oy + 110],
        radius=10,
        fill=(60, 35, 100, 200),
        outline=(200, 170, 255, 220),
        width=2,
    )
    draw.arc([ox + 15, oy, ox + 55, oy + 45], 200, 340, fill=(200, 170, 255, 220), width=3)
    # Броня
    draw.polygon(
        [(ox + 100, oy + 35), (ox + 175, oy + 35), (ox + 190, oy + 115), (ox + 85, oy + 115)],
        fill=(55, 30, 95, 200),
        outline=(190, 150, 255, 220),
    )
    # Шлем
    draw.arc([ox + 220, oy + 15, ox + 300, oy + 95], 180, 360, fill=(210, 180, 255, 230), width=4)
    draw.rectangle([ox + 235, oy + 55, ox + 285, oy + 100], fill=(50, 28, 88, 200))
    # Оружие
    draw.rounded_rectangle(
        [ox + 330, oy + 55, ox + 470, oy + 78],
        radius=6,
        fill=(45, 25, 80, 220),
        outline=(200, 170, 255, 230),
        width=2,
    )
    draw.rectangle([ox + 400, oy + 40, ox + 420, oy + 95], fill=(70, 40, 110, 200))


def _draw_uc_coins(draw, x: int, y: int, font) -> None:
    for i, dx in enumerate((0, 38, 76)):
        draw.ellipse(
            [x + dx, y, x + dx + 32, y + 32],
            fill=(120, 60, 200, 180 - i * 30),
            outline=(230, 200, 255, 220),
            width=2,
        )
        draw.text((x + dx + 6, y + 6), "MC", fill=(255, 255, 255, 230), font=font)


def generate_banner(path: Path) -> bool:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        logger.warning("Pillow не установлен — баннер не создан.")
        return False

    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = 1200, 630
    img = Image.new("RGB", (w, h))
    _draw_background(img.load(), w, h)

    draw = ImageDraw.Draw(img, "RGBA")
    _draw_metro_floor(draw, w, h)
    _draw_moon(draw, 930, 120, 95)
    font_small = _load_font(18)
    _draw_uc_coins(draw, 850, 200, font_small)
    _draw_uc_coins(draw, 980, 320, font_small)

    _draw_gear_icons(draw, 40, 320)
    _draw_uc_coins(draw, 120, 480, font_small)
    _draw_uc_coins(draw, 200, 500, font_small)

    font_sub = _load_font(26)
    font_tag = _load_font(22)
    _draw_plaque(draw, 320, 100, 540, 220)
    font_logo = _load_font(52)
    font_logo2 = _load_font(38)
    draw.text((380, 155), "WIXYEZ", fill=(220, 215, 235, 255), font=font_logo)
    draw.text((380, 215), "METRO SHOP", fill=(180, 160, 220, 255), font=font_logo2)

    tx, ty = 52, 48
    draw.text((tx, ty), "PUBG MOBILE", fill=(200, 180, 240, 255), font=font_small)
    draw.text(
        (tx, ty + 28),
        "Самый качественный Metro Shop",
        fill=(210, 190, 245, 255),
        font=font_sub,
    )

    draw.rounded_rectangle(
        [52, 400, 700, 468],
        radius=16,
        fill=(35, 12, 75, 210),
        outline=(170, 130, 255, 255),
        width=2,
    )
    draw.text(
        (78, 418),
        "Сопровождение  ·  Буст  ·  Снаряжение  ·  24/7",
        fill=(240, 230, 255, 255),
        font=font_tag,
    )
    draw.text(
        (52, 500),
        "PayCore  ·  Гарантия выноса  ·  Премиум сервис",
        fill=(150, 125, 210, 255),
        font=font_small,
    )

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ov_draw = ImageDraw.Draw(overlay)
    ov_draw.rectangle([0, 0, w, h], fill=(0, 0, 0, 35))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    img.save(path, format="PNG", optimize=True)
    logger.info("Баннер создан: %s", path)
    return True


def ensure_banner(path: Path) -> Path:
    version_file = path.parent / ".banner_version"
    current = version_file.read_text(encoding="utf-8").strip() if version_file.is_file() else ""
    if current != BANNER_VERSION or not path.is_file():
        generate_banner(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        version_file.write_text(BANNER_VERSION, encoding="utf-8")
    return path
