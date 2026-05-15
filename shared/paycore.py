"""PayCore (Corefy) — создание платёжной страницы."""

from __future__ import annotations

import json
import uuid
from typing import Any

import aiohttp

from shared.config import Settings


class PayCoreNotConfiguredError(RuntimeError):
    pass


class PayCoreRequestError(RuntimeError):
    pass


async def create_payment_invoice(
    settings: Settings,
    *,
    amount: float,
    currency: str,
    description: str,
    reference_id: str | None = None,
) -> dict[str, Any]:
    if settings.paycore_mode.strip().lower() == "demo":
        ref = reference_id or str(uuid.uuid4())
        return {
            "id": f"demo-{ref}",
            "hpp_url": f"https://paycore.example/checkout/{ref}",
            "reference_id": ref,
        }

    if not settings.paycore_public_key or not settings.paycore_api_base_url:
        raise PayCoreNotConfiguredError(
            "Задайте PAYCORE_PUBLIC_KEY и PAYCORE_API_BASE_URL",
        )
    if not settings.paycore_payment_service:
        raise PayCoreNotConfiguredError("Задайте PAYCORE_PAYMENT_SERVICE")

    ref = reference_id or str(uuid.uuid4())
    base = settings.paycore_api_base_url.rstrip("/")
    url = f"{base}/public-api/payment-invoices"
    payload = {
        "public_key": settings.paycore_public_key,
        "reference_id": ref,
        "description": description[:512],
        "service": settings.paycore_payment_service,
        "currency": currency,
        "amount": float(amount),
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            text = await resp.text()
            try:
                body = json.loads(text)
            except json.JSONDecodeError:
                body = {"raw": text}
            if resp.status >= 400:
                raise PayCoreRequestError(f"PayCore HTTP {resp.status}: {text[:2000]}")

    data = body.get("data")
    if not isinstance(data, dict):
        raise PayCoreRequestError(f"Неожиданный ответ PayCore: {body}")
    return data
