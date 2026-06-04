from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Literal

import yaml

from app.models.settings import AIProviderName

AI_PROVIDER_API_KEY_ENV_VARS: dict[AIProviderName, str] = {
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq": "GROQ_API_KEY",
    "mistral": "MISTRAL_API_KEY",
}

KeySource = Literal["runtime", "env", "none"]

_DEFAULT_RUNTIME_DIR = Path(__file__).resolve().parents[2] / "runtime"
_KEY_STORE_FILENAME = "ai-provider-secrets.yaml"


@dataclass(frozen=True)
class AIKeyStatus:
    configured: bool
    source: KeySource
    last_updated_at: datetime | None
    masked_suffix: str | None


def get_ai_key_store_file() -> Path:
    runtime_dir = Path(os.getenv("APP_RUNTIME_DIR", str(_DEFAULT_RUNTIME_DIR)))
    return Path(
        os.getenv("APP_AI_KEY_STORE_FILE", str(runtime_dir / _KEY_STORE_FILENAME))
    )


def get_ai_api_key_env_var(provider: AIProviderName) -> str:
    return AI_PROVIDER_API_KEY_ENV_VARS[provider]


def read_ai_api_key_from_env(provider: AIProviderName) -> str | None:
    api_key = os.getenv(get_ai_api_key_env_var(provider))
    if api_key:
        return api_key
    return None


def _read_key_store(key_store_file: Path) -> dict[str, object]:
    if not key_store_file.is_file():
        return {"providers": {}}

    raw_data = yaml.safe_load(key_store_file.read_text(encoding="utf-8"))
    if not isinstance(raw_data, dict):
        return {"providers": {}}

    providers = raw_data.get("providers")
    if not isinstance(providers, dict):
        return {"providers": {}}

    return {"providers": providers}


def _parse_updated_at(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _mask_api_key(api_key: str) -> str:
    suffix = api_key[-4:] if len(api_key) >= 4 else api_key
    return f"...{suffix}"


def read_runtime_ai_api_key(
    provider: AIProviderName,
    *,
    key_store_file: Path | None = None,
) -> tuple[str | None, datetime | None]:
    store_path = key_store_file or get_ai_key_store_file()
    data = _read_key_store(store_path)
    providers = data.get("providers", {})
    if not isinstance(providers, dict):
        return None, None

    raw_entry = providers.get(provider)
    if not isinstance(raw_entry, dict):
        return None, None

    api_key = raw_entry.get("api_key")
    if not isinstance(api_key, str) or not api_key.strip():
        return None, None

    updated_at = _parse_updated_at(raw_entry.get("updated_at"))
    if updated_at is None:
        updated_at = datetime.fromtimestamp(store_path.stat().st_mtime, tz=timezone.utc)
    return api_key, updated_at


def resolve_ai_api_key(
    provider: AIProviderName,
    *,
    key_store_file: Path | None = None,
) -> tuple[str | None, KeySource, datetime | None, str | None]:
    runtime_key, runtime_updated_at = read_runtime_ai_api_key(
        provider,
        key_store_file=key_store_file,
    )
    if runtime_key:
        return runtime_key, "runtime", runtime_updated_at, _mask_api_key(runtime_key)

    env_key = read_ai_api_key_from_env(provider)
    if env_key:
        return env_key, "env", None, _mask_api_key(env_key)

    return None, "none", None, None


def read_ai_key_status(
    provider: AIProviderName,
    *,
    key_store_file: Path | None = None,
) -> AIKeyStatus:
    api_key, source, last_updated_at, masked_suffix = resolve_ai_api_key(
        provider,
        key_store_file=key_store_file,
    )
    return AIKeyStatus(
        configured=api_key is not None,
        source=source,
        last_updated_at=last_updated_at,
        masked_suffix=masked_suffix,
    )


def save_runtime_ai_api_key(
    provider: AIProviderName,
    api_key: str,
    *,
    key_store_file: Path | None = None,
) -> datetime:
    store_path = key_store_file or get_ai_key_store_file()
    store_path.parent.mkdir(parents=True, exist_ok=True)

    data = _read_key_store(store_path)
    providers = data.get("providers", {})
    if not isinstance(providers, dict):
        providers = {}

    updated_at = datetime.now(tz=timezone.utc)
    providers[provider] = {
        "api_key": api_key,
        "updated_at": updated_at.isoformat(),
    }
    payload = {"providers": providers}

    with NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=store_path.parent,
        delete=False,
    ) as temp_file:
        temp_path = Path(temp_file.name)
        yaml.safe_dump(payload, temp_file, sort_keys=True)

    try:
        os.chmod(temp_path, 0o600)
    except OSError:
        pass

    temp_path.replace(store_path)

    try:
        os.chmod(store_path, 0o600)
    except OSError:
        pass

    return updated_at
