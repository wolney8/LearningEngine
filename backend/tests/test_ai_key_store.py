from __future__ import annotations

from pathlib import Path

import yaml

from app.services.ai_key_store import (
    read_ai_key_status,
    resolve_ai_api_key,
    save_runtime_ai_api_key,
)


def test_env_key_works_when_runtime_key_is_absent(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini-key-1234")

    api_key, source, last_updated_at, masked_suffix = resolve_ai_api_key(
        "gemini",
        key_store_file=tmp_path / "ai-provider-secrets.yaml",
    )

    assert api_key == "env-gemini-key-1234"
    assert source == "env"
    assert last_updated_at is None
    assert masked_suffix == "...1234"


def test_runtime_key_overrides_env_key(tmp_path: Path, monkeypatch) -> None:
    store_file = tmp_path / "ai-provider-secrets.yaml"
    monkeypatch.setenv("GEMINI_API_KEY", "env-gemini-key-1234")
    save_runtime_ai_api_key(
        "gemini",
        "runtime-gemini-key-5678",
        key_store_file=store_file,
    )

    api_key, source, last_updated_at, masked_suffix = resolve_ai_api_key(
        "gemini",
        key_store_file=store_file,
    )

    assert api_key == "runtime-gemini-key-5678"
    assert source == "runtime"
    assert last_updated_at is not None
    assert masked_suffix == "...5678"


def test_restart_equivalent_reload_reads_persisted_runtime_key(
    tmp_path: Path,
) -> None:
    store_file = tmp_path / "ai-provider-secrets.yaml"
    save_runtime_ai_api_key(
        "gemini",
        "persisted-runtime-key-abcd",
        key_store_file=store_file,
    )

    first_read = resolve_ai_api_key("gemini", key_store_file=store_file)
    second_read = resolve_ai_api_key("gemini", key_store_file=store_file)

    assert first_read[0] == "persisted-runtime-key-abcd"
    assert second_read[0] == "persisted-runtime-key-abcd"
    assert first_read[1] == "runtime"
    assert second_read[1] == "runtime"


def test_status_masking_never_exposes_full_key(tmp_path: Path) -> None:
    store_file = tmp_path / "ai-provider-secrets.yaml"
    save_runtime_ai_api_key(
        "openai",
        "openai-secret-key-zz99",
        key_store_file=store_file,
    )

    status = read_ai_key_status("openai", key_store_file=store_file)

    assert status.configured is True
    assert status.source == "runtime"
    assert status.masked_suffix == "...zz99"
    assert status.masked_suffix != "openai-secret-key-zz99"
    raw_saved = yaml.safe_load(store_file.read_text(encoding="utf-8"))
    assert raw_saved["providers"]["openai"]["api_key"] == "openai-secret-key-zz99"
