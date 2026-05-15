"""Metro Shop Admin — панель в стиле PayCore. Запуск: python admin_server.py"""

from __future__ import annotations

import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import Depends, FastAPI, HTTPException, Header  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from shared.config import get_settings  # noqa: E402
from shared.repository import (  # noqa: E402
    create_product,
    create_promo,
    delete_product,
    delete_promo,
    get_product,
    init_db,
    list_category_settings,
    list_popular_products,
    list_products,
    list_promos,
    list_recent_orders,
    list_users,
    set_category_enabled,
    stats_summary,
    update_product,
)

WEB = ROOT / "web" / "admin"
app = FastAPI(title="Metro Shop Admin")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_auth(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    secret = settings.admin_password.strip()
    if not secret:
        raise HTTPException(503, "Задайте ADMIN_PASSWORD в .env")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Требуется авторизация")
    token = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(token, secret):
        raise HTTPException(401, "Неверный пароль")


class LoginBody(BaseModel):
    password: str


class ProductIn(BaseModel):
    id: str | None = None
    title: str = Field(min_length=1, max_length=120)
    description: str = ""
    amount: float = 0
    currency: str = "RUB"
    category: str = Field(pattern="^(escort|boost|gear)$")
    popular: bool = False
    extra_hint: str = ""
    button_style: str = "primary"
    active: bool = True
    sort_order: int = 0


class ProductPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    amount: float | None = None
    currency: str | None = None
    category: str | None = None
    popular: bool | None = None
    extra_hint: str | None = None
    button_style: str | None = None
    active: bool | None = None
    sort_order: int | None = None


class PromoIn(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    discount_percent: float = Field(ge=1, le=100)
    use_limit: int = Field(ge=1, le=100000)


class CategoryToggle(BaseModel):
    enabled: bool


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.post("/api/auth/login")
def api_login(body: LoginBody) -> dict:
    settings = get_settings()
    secret = settings.admin_password.strip()
    if not secret:
        raise HTTPException(503, "ADMIN_PASSWORD не задан")
    if not secrets.compare_digest(body.password, secret):
        raise HTTPException(401, "Неверный пароль")
    return {"token": secret, "brand": settings.shop_name}


@app.get("/api/meta")
def api_meta(_: None = Depends(_check_auth)) -> dict:
    s = get_settings()
    return {
        "brand": s.shop_name,
        "bot_name": "WIXYEZ METRO SHOP BOT",
        "reviews_url": s.reviews_url,
    }


@app.get("/api/stats")
def api_stats(_: None = Depends(_check_auth)) -> dict:
    return stats_summary()


@app.get("/api/products")
def api_products(_: None = Depends(_check_auth)) -> dict:
    items = list_products()
    return {
        "items": [
            {
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "amount": p.amount,
                "currency": p.currency,
                "category": p.category,
                "popular": p.popular,
                "extra_hint": p.extra_hint,
                "button_style": p.button_style,
                "active": p.active,
            }
            for p in items
        ],
    }


@app.post("/api/products")
def api_product_create(body: ProductIn, _: None = Depends(_check_auth)) -> dict:
    p = create_product(body.model_dump())
    return {"ok": True, "id": p.id}


@app.patch("/api/products/{product_id}")
def api_product_patch(
    product_id: str,
    body: ProductPatch,
    _: None = Depends(_check_auth),
) -> dict:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    p = update_product(product_id, data)
    if not p:
        raise HTTPException(404, "Товар не найден")
    return {"ok": True}


@app.delete("/api/products/{product_id}")
def api_product_delete(product_id: str, _: None = Depends(_check_auth)) -> dict:
    if not delete_product(product_id):
        raise HTTPException(404, "Товар не найден")
    return {"ok": True}


@app.get("/api/categories")
def api_categories(_: None = Depends(_check_auth)) -> dict:
    return {"items": list_category_settings()}


@app.patch("/api/categories/{category_id}")
def api_category_toggle(
    category_id: str,
    body: CategoryToggle,
    _: None = Depends(_check_auth),
) -> dict:
    set_category_enabled(category_id, body.enabled)
    return {"ok": True}


@app.get("/api/orders")
def api_orders(_: None = Depends(_check_auth)) -> dict:
    orders = list_recent_orders(200)
    return {
        "items": [
            {
                "id": o.id,
                "user_id": o.user_id,
                "username": o.username,
                "product_title": o.product_title,
                "amount": o.amount,
                "currency": o.currency,
                "pubg_id": o.pubg_id,
                "status": o.status,
                "created_at": o.created_at,
            }
            for o in orders
        ],
    }


@app.get("/api/promos")
def api_promos(_: None = Depends(_check_auth)) -> dict:
    return {"items": list_promos()}


@app.post("/api/promos")
def api_promo_create(body: PromoIn, _: None = Depends(_check_auth)) -> dict:
    create_promo(body.code, body.discount_percent, body.use_limit)
    return {"ok": True}


@app.delete("/api/promos/{code}")
def api_promo_delete(code: str, _: None = Depends(_check_auth)) -> dict:
    if not delete_promo(code):
        raise HTTPException(404)
    return {"ok": True}


@app.get("/api/users")
def api_users(_: None = Depends(_check_auth)) -> dict:
    return {"items": list_users(500)}


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB / "index.html")


app.mount("/static", StaticFiles(directory=str(WEB)), name="static")


def main() -> None:
    import uvicorn

    init_db()
    settings = get_settings()
    port = settings.resolved_admin_port()
    uvicorn.run("admin_server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
