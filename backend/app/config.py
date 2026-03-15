from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "MindMesh Backend"
    api_prefix: str = "/api"
    websocket_path: str = "/ws/{session_id}"
    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    pause_threshold_seconds: float = 1.5
    min_new_chars: int = 24
    generation_cooldown_seconds: float = 1.0

    llm_api_key: Optional[str] = None
    llm_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"
    llm_timeout_seconds: float = 8.0
    llm_max_retries: int = 1

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="MINDMESH_",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
