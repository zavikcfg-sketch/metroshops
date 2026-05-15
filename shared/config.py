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
    channel_username: str = Field(default="", validation_alias="CHANNEL_USERNAME")
    shop_name: str = Field(default="Metro Shop", validation_alias="SHOP_NAME")
    support_contact: str = Field(
        default="@your_support",
        validation_alias="SUPPORT_CONTACT",
    )

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
