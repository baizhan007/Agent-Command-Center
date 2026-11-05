from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ACC_", env_file=".env", extra="ignore")

    data_dir: Path = Path.home() / ".acc"
    allowed_roots: str = ""
    api_token: str = ""
    max_parallel: int = 3
    task_timeout_seconds: int = 3600
    dsh_executable: str = "dsh"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'acc.sqlite3').as_posix()}"

    @property
    def authorized_roots(self) -> list[Path]:
        return [Path(value.strip()).expanduser().resolve() for value in self.allowed_roots.split(",") if value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
