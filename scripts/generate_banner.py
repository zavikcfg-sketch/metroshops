#!/usr/bin/env python3
"""Опционально: пересоздать баннер вручную."""

from pathlib import Path

from shared.banner import generate_banner

if __name__ == "__main__":
    path = Path(__file__).resolve().parent.parent / "assets" / "banner.png"
    if generate_banner(path):
        print(f"OK: {path}")
    else:
        raise SystemExit(1)
