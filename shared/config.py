import os
import warnings
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_CWD_DOTENV = Path.cwd() / ".env"
_dotenv_candidates = [_PROJECT_ROOT / ".env"]
if _CWD_DOTENV.resolve() != (_PROJECT_ROOT / ".env").resolve():
    _dotenv_candidates.append(_CWD_DOTENV)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=tuple(str(p) for p in _dotenv_candidates),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    telegram_bot_token: str = Field(
        default="",
        validation_alias=AliasChoices("TELEGRAM_BOT_TOKEN", "BOT_TOKEN"),
    )
    telegram_bot_token_file: str = Field(
        default="",
        validation_alias=AliasChoices("TELEGRAM_BOT_TOKEN_FILE", "BOT_TOKEN_FILE"),
    )
    admin_ids: str = Field(default="", validation_alias="ADMIN_IDS")
    admin_password: str = Field(default="", validation_alias="ADMIN_PASSWORD")
    admin_port: int = Field(default=8080, validation_alias="ADMIN_PORT")

    def resolved_admin_port(self) -> int:
        port = os.environ.get("PORT", "").strip()
        if port.isdigit():
            return int(port)
        return self.admin_port
    telegram_bot_username: str = Field(default="", validation_alias="TELEGRAM_BOT_USERNAME")
    shop_name: str = Field(
        default="WIXYEZ METRO SHOP",
        validation_alias="SHOP_NAME",
    )
    support_contact: str = Field(default="@your_support", validation_alias="SUPPORT_CONTACT")
    channel_username: str = Field(default="", validation_alias="CHANNEL_USERNAME")
    website_url: str = Field(default="", validation_alias="WEBSITE_URL")
    metro_shop_url: str = Field(default="", validation_alias="METRO_SHOP_URL")
    reviews_url: str = Field(
        default="https://t.me/KotikexsMetroShopOtziv",
        validation_alias="REVIEWS_URL",
    )
    banner_path: str = Field(default="assets/banner.png", validation_alias="BANNER_PATH")

    paycore_api_base_url: str = Field(default="", validation_alias="PAYCORE_API_BASE_URL")
    paycore_public_key: str = Field(default="", validation_alias="PAYCORE_PUBLIC_KEY")
    paycore_payment_service: str = Field(default="", validation_alias="PAYCORE_PAYMENT_SERVICE")
    paycore_currency: str = Field(default="RUB", validation_alias="PAYCORE_CURRENCY")
    paycore_mode: str = Field(default="demo", validation_alias="PAYCORE_MODE")

    @field_validator("telegram_bot_token", mode="before")
    @classmethod
    def _strip_token(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    def resolve_token(self) -> str:
        t = self.telegram_bot_token.strip()
        if t:
            return t
        path = self.telegram_bot_token_file.strip()
        if not path:
            return ""
        fp = Path(path)
        if not fp.is_file():
            warnings.warn(f"Файл токена не найден: {path}", stacklevel=1)
            return ""
        return fp.read_text(encoding="utf-8").strip()

    def admin_id_list(self) -> list[int]:
        if not self.admin_ids.strip():
            return []
        result: list[int] = []
        for part in self.admin_ids.replace(";", ",").split(","):
            part = part.strip()
            if part.isdigit():
                result.append(int(part))
        return result

    def data_dir(self) -> Path:
        raw = os.environ.get("DATA_DIR", "").strip()
        if raw:
            return Path(raw)
        return _PROJECT_ROOT / "data"

    def banner_file(self) -> Path:
        p = Path(self.banner_path.strip() or "assets/banner.png")
        if p.is_absolute():
            return p
        return _PROJECT_ROOT / p

    def paycore_enabled(self) -> bool:
        if self.paycore_mode.strip().lower() == "demo":
            return True
        return bool(
            self.paycore_public_key.strip()
            and self.paycore_api_base_url.strip()
            and self.paycore_payment_service.strip(),
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
