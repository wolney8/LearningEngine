from __future__ import annotations

import json
import os
from importlib import import_module
from datetime import datetime, timezone
from typing import Any, Literal

import yaml
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlmodel import Session, select

from app.models.package import AdminPackageSummary, Package, PackageSummary
from app.models.refresh import (
    PackageAdminMetadataRecord,
    RefreshResult,
    StalePackageInfo,
)
from app.models.settings import AIProviderName, GameSettings
from app.models.user import (
    AdminAuditLog,
    SpendHistory,
    User,
    UserLibraryItem,
    UserTestResult,
)
from app.routers.users import require_admin_user
from app.services.deployment_mode import (
    get_deployment_mode,
    is_stateless_deployment,
    require_stateful_admin_write,
)
from app.services.ai_key_store import (
    KeySource,
    get_ai_key_store_file,
    read_ai_key_status,
    save_runtime_ai_api_key,
)
from app.services.db import get_session
from app.services.overrides_loader import (
    OVERRIDES_FILE,
    PackageOverride,
    derive_enabled_from_availability,
    resolve_effective_availability,
    save_package_overrides,
)
from app.services.package_import import (
    format_package_import_issue,
    summarise_package_preview,
    validate_package_yaml_content,
)
from app.services.package_loader import PACKAGES_DIR
from app.services.refresh_metadata_loader import (
    REFRESH_METADATA_FILE,
    save_refresh_metadata,
)
from app.services.refresh_service import (
    _bump_patch_version,
    compute_diff_summary,
    detect_stale_packages,
    write_refreshed_package,
)
from app.services.runtime_package_store import (
    compute_package_content_hash,
    enforce_runtime_package_storage_budget,
    get_runtime_package_storage_status,
    load_runtime_package_state,
    save_managed_package_record,
    serialise_package_yaml,
)
from app.services.settings_loader import SETTINGS_FILE, load_settings, save_settings

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin_user)],
)

AI_KEY_STORE_FILE = get_ai_key_store_file()
AI_ERROR_CODE_MISSING_API_KEY = "ai_missing_api_key"
AI_ERROR_CODE_PROVIDER_OVERLOADED = "ai_provider_overloaded"
AI_ERROR_CODE_PROVIDER_UNAVAILABLE = "ai_provider_unavailable"
AI_ERROR_CODE_UPSTREAM_FAILURE = "ai_upstream_failure"
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-exp"
SUPPORTED_AI_PROVIDERS: tuple[AIProviderName, ...] = (
    "gemini",
    "openai",
    "anthropic",
    "groq",
    "mistral",
)
AI_PROVIDER_DEFAULT_MODELS: dict[AIProviderName, str] = {
    "gemini": "gemini-2.5-flash",
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "groq": "llama-3.3-70b-versatile",
    "mistral": "mistral-small-latest",
}


class OptionalAIModuleUnavailableError(Exception):
    def __init__(self) -> None:
        super().__init__("Optional AI provider modules are unavailable")
        self.error_code = AI_ERROR_CODE_UPSTREAM_FAILURE


class AIGenerationError(Exception):
    def __init__(
        self,
        message: str,
        *,
        error_code: str = AI_ERROR_CODE_UPSTREAM_FAILURE,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code


def get_recommended_ai_model(provider: AIProviderName) -> str:
    return AI_PROVIDER_DEFAULT_MODELS[provider]


def _load_ai_generator_module():
    try:
        return import_module("app.services.ai_generator")
    except ModuleNotFoundError as exc:
        raise OptionalAIModuleUnavailableError() from exc


async def test_connection(
    *,
    settings: GameSettings,
    api_key: str | None,
    provider_override: AIProviderName | None,
    model_override: str | None,
) -> str:
    module = _load_ai_generator_module()
    return await module.test_connection(
        settings=settings,
        api_key=api_key,
        provider_override=provider_override,
        model_override=model_override,
    )


async def generate_package(
    *,
    topic: str,
    audience: str,
    num_pages: int,
    num_questions: int,
    settings: GameSettings,
) -> str:
    module = _load_ai_generator_module()
    return await module.generate_package(
        topic=topic,
        audience=audience,
        num_pages=num_pages,
        num_questions=num_questions,
        settings=settings,
    )


async def refresh_package(pkg: Package, *, settings: GameSettings) -> str:
    module = _load_ai_generator_module()
    return await module.refresh_package(pkg, settings=settings)


class PackageOverridePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    availability: Literal["available", "unavailable", "hidden"] | None = None
    enabled: bool | None = None
    xp_threshold: int | None = Field(default=None, ge=0)
    tags: list[str] | None = None

    @model_validator(mode="after")
    def validate_at_least_one_field(self) -> "PackageOverridePatchRequest":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class PublishPackageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    yaml_content: str = Field(min_length=1)


class AdminPackageValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str
    path: list[str] = Field(default_factory=list)
    line: int | None = None
    column: int | None = None


class AdminPackageValidationPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    description: str
    version: str
    page_count: int
    question_count: int


class AdminPackageValidationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    valid: bool
    preview: AdminPackageValidationPreview | None = None
    errors: list[AdminPackageValidationIssue] = Field(default_factory=list)
    formatted_errors: list[str] = Field(default_factory=list)
    yaml_content: str | None = None


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str = Field(min_length=3, max_length=500)
    audience: str = Field(default="general learners", max_length=200)
    num_pages: int = Field(default=3, ge=1, le=20)
    num_questions: int = Field(default=8, ge=8, le=40)


class GenerateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    yaml_content: str


class AdminAIConfigResponse(BaseModel):
    class ProviderOption(BaseModel):
        provider: AIProviderName
        recommended_model: str

    model_config = ConfigDict(extra="forbid")

    provider: AIProviderName
    model: str
    configured: bool
    key_source: KeySource
    key_last_updated_at: datetime | None = None
    key_masked_suffix: str | None = None
    supported_providers: list[AIProviderName]
    provider_options: list[ProviderOption]


class AdminAIConfigUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: AIProviderName
    model: str = Field(min_length=1)


class AdminAIConnectionTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str | None = Field(default=None, min_length=1)
    provider: AIProviderName | None = None
    model: str | None = Field(default=None, min_length=1)


class AdminAIConnectionTestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    message: str
    model_used: str


class AdminAIKeyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    api_key: str = Field(min_length=1)
    provider: AIProviderName
    model: str = Field(min_length=1)


class AdminAIKeyUpdateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    success: bool
    message: str
    model_used: str
    config: AdminAIConfigResponse


class AdminRuntimeCapabilitiesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    deployment_mode: Literal["stateful", "stateless"]
    stateful_admin_writes: bool


class AdminPackageStorageStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    used_bytes: int
    budget_bytes: int
    remaining_bytes: int
    percent_used: float
    limit_reached: bool


class AdminUserSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    email: str
    role: Literal["student", "admin"]
    xp: int
    pending_bonus_xp: int
    pending_bonus_reason: str | None
    created_at: datetime


class AdminUserRoleUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["student", "admin"]


class AdminUserXPSetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xp: int = Field(ge=0)


class AdminUserXPBonusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    xp: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=500)


class AdminUserXPResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    role: Literal["student", "admin"]
    xp: int
    pending_bonus_xp: int
    pending_bonus_reason: str | None


class AdminUserProgressResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reset_xp: bool = False


class AdminUserProgressResetResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    role: Literal["student", "admin"]
    xp: int
    pending_bonus_xp: int
    pending_bonus_reason: str | None
    cleared_progress_count: int
    reset_xp: bool


class AdminUserDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    username: str
    deleted_progress_count: int
    deleted_library_count: int
    deleted_spend_history_count: int
    deleted_audit_log_count: int


class AdminPackageDeleteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    package_id: str
    operation: Literal["archived", "deleted"]
    summary: PackageSummary | None = None


class AdminAuditLogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    actor_user_id: int
    action: str
    target_user_id: int | None
    package_id: str | None
    details: dict[str, Any]
    created_at: datetime


def to_admin_user_summary(user: User) -> AdminUserSummary:
    return AdminUserSummary(
        id=user.id or 0,
        username=user.username,
        email=user.email,
        role=user.role,
        xp=user.xp,
        pending_bonus_xp=user.pending_bonus_xp,
        pending_bonus_reason=user.pending_bonus_reason,
        created_at=user.created_at,
    )


def to_admin_user_xp_response(user: User) -> AdminUserXPResponse:
    return AdminUserXPResponse(
        id=user.id or 0,
        username=user.username,
        role=user.role,
        xp=user.xp,
        pending_bonus_xp=user.pending_bonus_xp,
        pending_bonus_reason=user.pending_bonus_reason,
    )


def to_admin_user_progress_reset_response(
    user: User,
    *,
    cleared_progress_count: int,
    reset_xp: bool,
) -> AdminUserProgressResetResponse:
    return AdminUserProgressResetResponse(
        id=user.id or 0,
        username=user.username,
        role=user.role,
        xp=user.xp,
        pending_bonus_xp=user.pending_bonus_xp,
        pending_bonus_reason=user.pending_bonus_reason,
        cleared_progress_count=cleared_progress_count,
        reset_xp=reset_xp,
    )


def to_admin_user_delete_response(
    *,
    user_id: int,
    username: str,
    deleted_progress_count: int,
    deleted_library_count: int,
    deleted_spend_history_count: int,
    deleted_audit_log_count: int,
) -> AdminUserDeleteResponse:
    return AdminUserDeleteResponse(
        id=user_id,
        username=username,
        deleted_progress_count=deleted_progress_count,
        deleted_library_count=deleted_library_count,
        deleted_spend_history_count=deleted_spend_history_count,
        deleted_audit_log_count=deleted_audit_log_count,
    )


def _get_user_or_404(session: Session, user_id: int) -> User:
    user = session.exec(select(User).where(User.id == user_id)).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _log_admin_action(
    session: Session,
    *,
    actor_user_id: int,
    action: str,
    target_user_id: int | None = None,
    package_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    session.add(
        AdminAuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_user_id=target_user_id,
            package_id=package_id,
            details_json=json.dumps(details or {}, sort_keys=True),
        )
    )


def _to_admin_audit_log_entry(entry: AdminAuditLog) -> AdminAuditLogEntry:
    try:
        details_raw = json.loads(entry.details_json)
    except json.JSONDecodeError:
        details_raw = {"raw": entry.details_json}

    if not isinstance(details_raw, dict):
        details_raw = {"value": details_raw}

    return AdminAuditLogEntry(
        id=entry.id or 0,
        actor_user_id=entry.actor_user_id,
        action=entry.action,
        target_user_id=entry.target_user_id,
        package_id=entry.package_id,
        details=details_raw,
        created_at=entry.created_at,
    )


def _collect_changed_key_paths(
    previous: Any,
    current: Any,
    *,
    prefix: str = "",
) -> list[str]:
    if isinstance(previous, dict) and isinstance(current, dict):
        changed: list[str] = []
        keys = sorted(set(previous.keys()) | set(current.keys()))
        for key in keys:
            key_str = str(key)
            child_prefix = f"{prefix}.{key_str}" if prefix else key_str
            if key not in previous or key not in current:
                changed.append(child_prefix)
                continue
            changed.extend(
                _collect_changed_key_paths(
                    previous[key],
                    current[key],
                    prefix=child_prefix,
                )
            )
        return changed

    if previous != current and prefix:
        return [prefix]

    return []


def _normalise_query_timestamp(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_settings_cache(request: Request) -> GameSettings:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        settings = load_settings()
        request.app.state.settings = settings
    return settings


def get_packages_cache(request: Request) -> dict[str, Package]:
    return request.app.state.packages


def get_package_overrides(request: Request) -> dict[str, PackageOverride]:
    return request.app.state.package_overrides


def get_refresh_metadata_cache(
    request: Request,
) -> dict[str, PackageAdminMetadataRecord]:
    return request.app.state.refresh_metadata


def _sync_stateless_runtime_package_state(request: Request, session: Session) -> None:
    seed_packages = getattr(request.app.state, "seed_packages", {})
    runtime_state = load_runtime_package_state(seed_packages, session)
    request.app.state.packages = runtime_state.packages
    request.app.state.package_overrides = runtime_state.overrides
    request.app.state.refresh_metadata = runtime_state.refresh_metadata


def build_package_summary(
    pkg: Package,
    override: PackageOverride | None,
) -> PackageSummary:
    availability = resolve_effective_availability(override)
    return PackageSummary(
        id=pkg.id,
        title=pkg.title,
        description=pkg.description,
        version=pkg.version,
        tags=pkg.tags,
        passing_score=pkg.passing_score,
        page_count=len(pkg.pages),
        question_count=len(pkg.questions),
        availability=availability,
        enabled=derive_enabled_from_availability(availability),
        xp_threshold=override.xp_threshold if override else None,
    )


def build_admin_package_summary(
    pkg: Package,
    override: PackageOverride | None,
    metadata: PackageAdminMetadataRecord | None,
) -> AdminPackageSummary:
    base_summary = build_package_summary(pkg, override)
    return AdminPackageSummary(
        **base_summary.model_dump(),
        added_at=metadata.added_at if metadata else None,
        last_refreshed_at=metadata.last_refreshed_at if metadata else None,
    )


def build_ai_config_response(settings: GameSettings) -> AdminAIConfigResponse:
    key_status = read_ai_key_status(
        settings.ai.provider,
        key_store_file=AI_KEY_STORE_FILE,
    )
    return AdminAIConfigResponse(
        provider=settings.ai.provider,
        model=settings.ai.model,
        configured=key_status.configured,
        key_source=key_status.source,
        key_last_updated_at=key_status.last_updated_at,
        key_masked_suffix=key_status.masked_suffix,
        supported_providers=list(SUPPORTED_AI_PROVIDERS),
        provider_options=[
            AdminAIConfigResponse.ProviderOption(
                provider=provider,
                recommended_model=get_recommended_ai_model(provider),
            )
            for provider in SUPPORTED_AI_PROVIDERS
        ],
    )


def _build_ai_error_detail(exc: Exception) -> dict[str, str]:
    code = getattr(exc, "error_code", AI_ERROR_CODE_UPSTREAM_FAILURE)
    safe_messages = {
        AI_ERROR_CODE_MISSING_API_KEY: (
            "AI service is not configured. Ask an administrator to add the API key."
        ),
        AI_ERROR_CODE_PROVIDER_OVERLOADED: (
            "AI provider is experiencing high demand. Please try again shortly."
        ),
        AI_ERROR_CODE_PROVIDER_UNAVAILABLE: (
            "AI provider is temporarily unavailable. Please try again shortly."
        ),
        AI_ERROR_CODE_UPSTREAM_FAILURE: (
            "AI generation failed due to an upstream provider error. Please try again."
        ),
    }
    return {
        "error_code": code,
        "message": safe_messages.get(
            code,
            "AI generation failed due to an upstream provider error. Please try again.",
        ),
    }


def _resolve_ai_test_model(settings: GameSettings, model_override: str | None) -> str:
    return model_override or settings.ai.model or os.getenv(
        "GEMINI_MODEL", DEFAULT_GEMINI_MODEL
    )


def _build_ai_connection_test_failure_message(error_code: str) -> str:
    if error_code == AI_ERROR_CODE_PROVIDER_OVERLOADED:
        return (
            "AI provider is under high demand. Try again shortly or switch to a "
            "different model."
        )
    if error_code == AI_ERROR_CODE_PROVIDER_UNAVAILABLE:
        return "AI provider is temporarily unavailable. Please try again shortly."
    if error_code == AI_ERROR_CODE_MISSING_API_KEY:
        return "AI API key is missing or invalid. Check the key and AI configuration."
    return "Connection test failed. Check provider, model, and API key."


def _get_ai_error_code(exc: Exception) -> str:
    return getattr(exc, "error_code", AI_ERROR_CODE_UPSTREAM_FAILURE)


def _normalise_tags(raw_tags: list[str] | None) -> list[str]:
    if raw_tags is None:
        return []

    normalised: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        tag = raw_tag.strip()
        if not tag:
            continue
        dedupe_key = tag.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalised.append(tag)
    return normalised


def _write_package_yaml_file(pkg: Package, package_file: str) -> None:
    content = yaml.dump(
        pkg.model_dump(mode="json"),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    package_path = PACKAGES_DIR / package_file
    package_path.parent.mkdir(parents=True, exist_ok=True)
    package_path.write_text(content, encoding="utf-8")


def _to_admin_package_validation_response(
    yaml_content: str,
    *,
    package_ids: set[str],
) -> AdminPackageValidationResponse:
    result = validate_package_yaml_content(
        yaml_content,
        existing_package_ids=package_ids,
    )
    preview = None
    if result.package is not None:
        preview = AdminPackageValidationPreview.model_validate(
            summarise_package_preview(result.package)
        )
    issues = [
        AdminPackageValidationIssue(
            message=issue.message,
            path=issue.path,
            line=issue.line,
            column=issue.column,
        )
        for issue in result.issues
    ]
    return AdminPackageValidationResponse(
        valid=result.valid,
        preview=preview,
        errors=issues,
        formatted_errors=[
            format_package_import_issue(issue) for issue in result.issues
        ],
        yaml_content=yaml_content,
    )


def _read_uploaded_yaml_file(upload: UploadFile) -> str:
    filename = upload.filename or ""
    if not filename:
        raise HTTPException(status_code=422, detail="Upload a .yaml or .yml file")

    lowered = filename.lower()
    if not (lowered.endswith(".yaml") or lowered.endswith(".yml")):
        raise HTTPException(
            status_code=422,
            detail="Only .yaml or .yml files are supported",
        )

    if any(separator in filename for separator in ("/", "\\")):
        raise HTTPException(status_code=422, detail="Unsafe upload filename rejected")

    raw_bytes = upload.file.read()
    if not raw_bytes:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    try:
        return raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="Uploaded YAML must be UTF-8 encoded",
        ) from exc


@router.get(
    "/settings",
    response_model=GameSettings,
)
async def read_admin_settings(
    settings: GameSettings = Depends(get_settings_cache),
) -> GameSettings:
    return settings


@router.get(
    "/runtime-capabilities",
    response_model=AdminRuntimeCapabilitiesResponse,
)
async def read_admin_runtime_capabilities() -> AdminRuntimeCapabilitiesResponse:
    deployment_mode = get_deployment_mode()
    return AdminRuntimeCapabilitiesResponse(
        deployment_mode=deployment_mode,
        stateful_admin_writes=deployment_mode == "stateful",
    )


@router.get(
    "/packages/storage-status",
    response_model=AdminPackageStorageStatusResponse,
)
async def read_admin_package_storage_status(
    session: Session = Depends(get_session),
) -> AdminPackageStorageStatusResponse:
    status = get_runtime_package_storage_status(session)
    return AdminPackageStorageStatusResponse(**status.model_dump())


@router.put(
    "/settings",
    response_model=GameSettings,
)
async def update_admin_settings(
    body: GameSettings,
    request: Request,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
    current_settings: GameSettings = Depends(get_settings_cache),
) -> GameSettings:
    require_stateful_admin_write()
    previous_payload = current_settings.model_dump(mode="json")
    next_payload = body.model_dump(mode="json")
    changed_keys = _collect_changed_key_paths(previous_payload, next_payload)

    save_settings(body, SETTINGS_FILE)
    request.app.state.settings = body

    if changed_keys:
        celebration_changed_keys = [
            key
            for key in changed_keys
            if key == "celebration_effects"
            or key.startswith("celebration_effects.")
        ]
        _log_admin_action(
            session,
            actor_user_id=current_admin.id or 0,
            action="settings.updated",
            details={
                "changed_count": len(changed_keys),
                "changed_keys": changed_keys,
                "celebration_effects_changed_keys": celebration_changed_keys,
            },
        )
        session.commit()

    return body


@router.get(
    "/ai-config",
    response_model=AdminAIConfigResponse,
)
async def read_admin_ai_config(
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConfigResponse:
    return build_ai_config_response(settings)


async def _update_admin_ai_config(
    body: AdminAIConfigUpdateRequest,
    request: Request,
    settings: GameSettings,
) -> AdminAIConfigResponse:
    require_stateful_admin_write()
    updated_ai = settings.ai.model_copy(
        update={"provider": body.provider, "model": body.model}
    )
    updated_settings = settings.model_copy(update={"ai": updated_ai})
    save_settings(updated_settings, SETTINGS_FILE)
    request.app.state.settings = updated_settings
    return build_ai_config_response(updated_settings)


@router.put(
    "/ai-config",
    response_model=AdminAIConfigResponse,
)
async def update_admin_ai_config_put(
    body: AdminAIConfigUpdateRequest,
    request: Request,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConfigResponse:
    return await _update_admin_ai_config(body, request, settings)


@router.patch(
    "/ai-config",
    response_model=AdminAIConfigResponse,
)
async def update_admin_ai_config_patch(
    body: AdminAIConfigUpdateRequest,
    request: Request,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConfigResponse:
    return await _update_admin_ai_config(body, request, settings)


@router.post(
    "/ai-config/test",
    response_model=AdminAIConnectionTestResponse,
)
async def test_admin_ai_connection(
    body: AdminAIConnectionTestRequest,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIConnectionTestResponse:
    model_used = _resolve_ai_test_model(settings, body.model)

    try:
        tested_model = await test_connection(
            settings=settings,
            api_key=body.api_key,
            provider_override=body.provider,
            model_override=body.model,
        )
    except Exception as exc:
        return AdminAIConnectionTestResponse(
            success=False,
            message=_build_ai_connection_test_failure_message(_get_ai_error_code(exc)),
            model_used=model_used,
        )

    return AdminAIConnectionTestResponse(
        success=True,
        message="Connection test succeeded.",
        model_used=tested_model or model_used,
    )


@router.post(
    "/ai-config/key",
    response_model=AdminAIKeyUpdateResponse,
)
async def save_admin_ai_key(
    body: AdminAIKeyUpdateRequest,
    request: Request,
    settings: GameSettings = Depends(get_settings_cache),
) -> AdminAIKeyUpdateResponse:
    require_stateful_admin_write()
    updated_ai = settings.ai.model_copy(
        update={"provider": body.provider, "model": body.model}
    )
    updated_settings = settings.model_copy(update={"ai": updated_ai})
    save_settings(updated_settings, SETTINGS_FILE)
    request.app.state.settings = updated_settings
    save_runtime_ai_api_key(
        body.provider,
        body.api_key,
        key_store_file=AI_KEY_STORE_FILE,
    )

    try:
        tested_model = await test_connection(
            settings=updated_settings,
            api_key=body.api_key,
            provider_override=body.provider,
            model_override=body.model,
        )
        message = "API key saved and connection test succeeded."
        success = True
    except Exception as exc:
        tested_model = _resolve_ai_test_model(updated_settings, body.model)
        message = _build_ai_connection_test_failure_message(_get_ai_error_code(exc))
        success = False

    return AdminAIKeyUpdateResponse(
        success=success,
        message=message,
        model_used=tested_model,
        config=build_ai_config_response(updated_settings),
    )


@router.get(
    "/packages",
    response_model=list[AdminPackageSummary],
)
async def list_admin_packages(
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
) -> list[AdminPackageSummary]:
    return [
        build_admin_package_summary(
            pkg,
            overrides.get(pkg.id),
            refresh_metadata.get(pkg.id),
        )
        for pkg in sorted(packages.values(), key=lambda item: item.id)
    ]


@router.get(
    "/users",
    response_model=list[AdminUserSummary],
)
async def list_admin_users(
    session: Session = Depends(get_session),
) -> list[AdminUserSummary]:
    users = session.exec(select(User).order_by(User.created_at, User.id)).all()
    return [to_admin_user_summary(user) for user in users]


@router.patch(
    "/users/{user_id}/role",
    response_model=AdminUserSummary,
)
async def patch_admin_user_role(
    user_id: int,
    body: AdminUserRoleUpdateRequest,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserSummary:
    user = _get_user_or_404(session, user_id)
    previous_role = user.role

    if user.role == body.role:
        return to_admin_user_summary(user)

    if user.role == "admin" and body.role != "admin":
        admin_count = len(session.exec(select(User).where(User.role == "admin")).all())
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Cannot remove admin role from the last remaining admin user"
                ),
            )

    user.role = body.role
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.role_changed",
        target_user_id=user.id,
        details={"from_role": previous_role, "to_role": body.role},
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_summary(user)


@router.patch(
    "/users/{user_id}/xp/set",
    response_model=AdminUserXPResponse,
)
async def patch_admin_user_xp_set(
    user_id: int,
    body: AdminUserXPSetRequest,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserXPResponse:
    user = _get_user_or_404(session, user_id)
    previous_xp = user.xp
    user.xp = body.xp
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.xp_set",
        target_user_id=user.id,
        details={"from_xp": previous_xp, "to_xp": body.xp},
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_xp_response(user)


@router.post(
    "/users/{user_id}/xp/reset",
    response_model=AdminUserXPResponse,
)
async def post_admin_user_xp_reset(
    user_id: int,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserXPResponse:
    user = _get_user_or_404(session, user_id)
    previous_xp = user.xp
    previous_pending_bonus_xp = user.pending_bonus_xp
    previous_pending_bonus_reason = user.pending_bonus_reason
    user.xp = 0
    user.pending_bonus_xp = 0
    user.pending_bonus_reason = None
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.xp_reset",
        target_user_id=user.id,
        details={
            "from_xp": previous_xp,
            "from_pending_bonus_xp": previous_pending_bonus_xp,
            "from_pending_bonus_reason": previous_pending_bonus_reason,
        },
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_xp_response(user)


@router.post(
    "/users/{user_id}/xp/bonus",
    response_model=AdminUserXPResponse,
)
async def post_admin_user_xp_bonus(
    user_id: int,
    body: AdminUserXPBonusRequest,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserXPResponse:
    user = _get_user_or_404(session, user_id)
    previous_xp = user.xp
    user.xp += body.xp
    user.pending_bonus_xp = body.xp
    user.pending_bonus_reason = body.reason.strip()
    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.xp_bonus_applied",
        target_user_id=user.id,
        details={
            "bonus_xp": body.xp,
            "reason": user.pending_bonus_reason,
            "from_xp": previous_xp,
            "to_xp": user.xp,
        },
    )
    session.commit()
    session.refresh(user)
    return to_admin_user_xp_response(user)


@router.post(
    "/users/{user_id}/progress/reset",
    response_model=AdminUserProgressResetResponse,
)
async def post_admin_user_progress_reset(
    user_id: int,
    body: AdminUserProgressResetRequest | None = None,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserProgressResetResponse:
    user = _get_user_or_404(session, user_id)
    reset_xp = bool(body.reset_xp) if body is not None else False
    previous_xp = user.xp
    previous_pending_bonus_xp = user.pending_bonus_xp
    previous_pending_bonus_reason = user.pending_bonus_reason

    user_results = session.exec(
        select(UserTestResult).where(UserTestResult.user_id == user_id)
    ).all()
    for result in user_results:
        session.delete(result)

    if reset_xp:
        user.xp = 0
        user.pending_bonus_xp = 0
        user.pending_bonus_reason = None

    session.add(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="user.progress_reset",
        target_user_id=user.id,
        details={
            "cleared_progress_count": len(user_results),
            "reset_xp": reset_xp,
            "from_xp": previous_xp,
            "to_xp": user.xp,
            "from_pending_bonus_xp": previous_pending_bonus_xp,
            "from_pending_bonus_reason": previous_pending_bonus_reason,
        },
    )
    session.commit()
    session.refresh(user)

    return to_admin_user_progress_reset_response(
        user,
        cleared_progress_count=len(user_results),
        reset_xp=reset_xp,
    )


@router.delete(
    "/users/{user_id}",
    response_model=AdminUserDeleteResponse,
)
async def delete_admin_user(
    user_id: int,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
) -> AdminUserDeleteResponse:
    current_admin_id = current_admin.id or 0
    if user_id == current_admin_id:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete the currently signed-in admin user",
        )

    user = _get_user_or_404(session, user_id)

    if user.role == "admin":
        admin_count = len(session.exec(select(User).where(User.role == "admin")).all())
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot delete the last remaining admin user",
            )

    deleted_username = user.username

    user_results = session.exec(
        select(UserTestResult).where(UserTestResult.user_id == user_id)
    ).all()
    user_library_items = session.exec(
        select(UserLibraryItem).where(UserLibraryItem.user_id == user_id)
    ).all()
    spend_history_rows = session.exec(
        select(SpendHistory).where(SpendHistory.user_id == user_id)
    ).all()
    audit_rows = session.exec(
        select(AdminAuditLog).where(
            (AdminAuditLog.actor_user_id == user_id)
            | (AdminAuditLog.target_user_id == user_id)
        )
    ).all()

    for row in user_results:
        session.delete(row)
    for row in user_library_items:
        session.delete(row)
    for row in spend_history_rows:
        session.delete(row)
    for row in audit_rows:
        session.delete(row)

    session.delete(user)
    _log_admin_action(
        session,
        actor_user_id=current_admin_id,
        action="user.deleted",
        details={
            "deleted_user_id": user_id,
            "deleted_username": deleted_username,
            "deleted_progress_count": len(user_results),
            "deleted_library_count": len(user_library_items),
            "deleted_spend_history_count": len(spend_history_rows),
            "deleted_audit_log_count": len(audit_rows),
        },
    )
    session.commit()

    return to_admin_user_delete_response(
        user_id=user_id,
        username=deleted_username,
        deleted_progress_count=len(user_results),
        deleted_library_count=len(user_library_items),
        deleted_spend_history_count=len(spend_history_rows),
        deleted_audit_log_count=len(audit_rows),
    )


@router.patch(
    "/packages/{package_id}",
    response_model=PackageSummary,
)
async def patch_admin_package(
    package_id: str,
    body: PackageOverridePatchRequest,
    request: Request,
    session: Session = Depends(get_session),
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
) -> PackageSummary:
    pkg = packages.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    if not is_stateless_deployment():
        require_stateful_admin_write()

    updated_pkg = pkg
    if "tags" in body.model_fields_set:
        normalised_tags = _normalise_tags(body.tags)
        updated_pkg = pkg.model_copy(update={"tags": normalised_tags})
        if is_stateless_deployment():
            yaml_content = serialise_package_yaml(updated_pkg)
            try:
                enforce_runtime_package_storage_budget(
                    session,
                    new_yaml_content=yaml_content,
                    package_id=package_id,
                )
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc
            current_override = overrides.get(package_id, PackageOverride())
            metadata = request.app.state.refresh_metadata.get(package_id)
            save_managed_package_record(
                session,
                package_id=package_id,
                yaml_content=yaml_content,
                availability=resolve_effective_availability(current_override),
                xp_threshold=current_override.xp_threshold,
                deleted=False,
                added_at=metadata.added_at if metadata else None,
                last_refreshed_at=metadata.last_refreshed_at if metadata else None,
                previous_version=metadata.previous_version if metadata else None,
                new_version=metadata.new_version if metadata else None,
                diff_summary=metadata.diff_summary if metadata else None,
                content_hash=compute_package_content_hash(yaml_content),
            )
            _sync_stateless_runtime_package_state(request, session)
            packages = request.app.state.packages
            overrides = request.app.state.package_overrides
            updated_pkg = packages[package_id]
        else:
            try:
                _write_package_yaml_file(updated_pkg, f"{package_id}.yaml")
            except OSError as exc:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to write package file",
                ) from exc
            packages[package_id] = updated_pkg
            request.app.state.packages = packages

    current = overrides.get(package_id, PackageOverride())
    update_data: dict[str, Any] = {}
    if "availability" in body.model_fields_set:
        update_data["availability"] = body.availability
        update_data["enabled"] = None
    elif "enabled" in body.model_fields_set:
        update_data["availability"] = "available" if body.enabled else "unavailable"
        update_data["enabled"] = None
    if "xp_threshold" in body.model_fields_set:
        update_data["xp_threshold"] = body.xp_threshold

    updated_override = current.model_copy(update=update_data)
    if is_stateless_deployment():
        yaml_content = serialise_package_yaml(updated_pkg)
        try:
            enforce_runtime_package_storage_budget(
                session,
                new_yaml_content=yaml_content,
                package_id=package_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        metadata = request.app.state.refresh_metadata.get(package_id)
        save_managed_package_record(
            session,
            package_id=package_id,
            yaml_content=yaml_content,
            availability=resolve_effective_availability(updated_override),
            xp_threshold=updated_override.xp_threshold,
            deleted=False,
            added_at=metadata.added_at if metadata else None,
            last_refreshed_at=metadata.last_refreshed_at if metadata else None,
            previous_version=metadata.previous_version if metadata else None,
            new_version=metadata.new_version if metadata else None,
            diff_summary=metadata.diff_summary if metadata else None,
            content_hash=compute_package_content_hash(yaml_content),
        )
        _sync_stateless_runtime_package_state(request, session)
        updated_pkg = request.app.state.packages[package_id]
        updated_override = request.app.state.package_overrides[package_id]
    else:
        overrides[package_id] = updated_override

        save_package_overrides(overrides, OVERRIDES_FILE)
        request.app.state.package_overrides = overrides

    return build_package_summary(updated_pkg, updated_override)


@router.delete(
    "/packages/{package_id}",
    response_model=AdminPackageDeleteResponse,
)
async def delete_admin_package(
    package_id: str,
    request: Request,
    permanent: bool = False,
    confirm: bool = False,
    current_admin: User = Depends(require_admin_user),
    session: Session = Depends(get_session),
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
) -> AdminPackageDeleteResponse:
    pkg = packages.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    if not is_stateless_deployment():
        require_stateful_admin_write()

    if not permanent:
        current = overrides.get(package_id, PackageOverride())
        archived_override = current.model_copy(
            update={"availability": "hidden", "enabled": None}
        )
        if is_stateless_deployment():
            yaml_content = serialise_package_yaml(pkg)
            metadata = refresh_metadata.get(package_id)
            save_managed_package_record(
                session,
                package_id=package_id,
                yaml_content=yaml_content,
                availability="hidden",
                xp_threshold=archived_override.xp_threshold,
                deleted=False,
                added_at=metadata.added_at if metadata else None,
                last_refreshed_at=metadata.last_refreshed_at if metadata else None,
                previous_version=metadata.previous_version if metadata else None,
                new_version=metadata.new_version if metadata else None,
                diff_summary=metadata.diff_summary if metadata else None,
                content_hash=compute_package_content_hash(yaml_content),
            )
            _sync_stateless_runtime_package_state(request, session)
            archived_override = request.app.state.package_overrides[package_id]
        else:
            overrides[package_id] = archived_override

            save_package_overrides(overrides, OVERRIDES_FILE)
            request.app.state.package_overrides = overrides

        _log_admin_action(
            session,
            actor_user_id=current_admin.id or 0,
            action="package.archived",
            package_id=package_id,
            details={"permanent": False},
        )
        session.commit()

        return AdminPackageDeleteResponse(
            package_id=package_id,
            operation="archived",
            summary=build_package_summary(pkg, archived_override),
        )

    if not confirm:
        raise HTTPException(
            status_code=400,
            detail=(
                "Permanent delete requires confirm=true. "
                "Use archive mode (default) for reversible removal."
            ),
        )

    if len(packages) <= 1:
        raise HTTPException(
            status_code=409,
            detail="Cannot permanently delete the last remaining package",
        )

    if is_stateless_deployment():
        save_managed_package_record(
            session,
            package_id=package_id,
            yaml_content="",
            availability="hidden",
            xp_threshold=None,
            deleted=True,
        )
        _sync_stateless_runtime_package_state(request, session)
    else:
        package_file = PACKAGES_DIR / f"{package_id}.yaml"
        if package_file.exists():
            try:
                package_file.unlink()
            except OSError as exc:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to delete package file",
                ) from exc

        packages.pop(package_id, None)
        overrides.pop(package_id, None)
        refresh_metadata.pop(package_id, None)

        save_package_overrides(overrides, OVERRIDES_FILE)
        save_refresh_metadata(refresh_metadata, REFRESH_METADATA_FILE)

        request.app.state.packages = packages
        request.app.state.package_overrides = overrides
        request.app.state.refresh_metadata = refresh_metadata

    _log_admin_action(
        session,
        actor_user_id=current_admin.id or 0,
        action="package.permanently_deleted",
        package_id=package_id,
        details={"permanent": True},
    )
    session.commit()

    return AdminPackageDeleteResponse(
        package_id=package_id,
        operation="deleted",
    )


@router.get(
    "/audit-logs",
    response_model=list[AdminAuditLogEntry],
)
async def list_admin_audit_logs(
    limit: int = Query(default=50, ge=1, le=500),
    action: str | None = Query(default=None, min_length=1, max_length=100),
    actor_user_id: int | None = Query(default=None, ge=1),
    from_timestamp: datetime | None = Query(default=None, alias="from"),
    until_timestamp: datetime | None = Query(default=None, alias="until"),
    session: Session = Depends(get_session),
) -> list[AdminAuditLogEntry]:
    from_timestamp = _normalise_query_timestamp(from_timestamp)
    until_timestamp = _normalise_query_timestamp(until_timestamp)
    if (
        from_timestamp is not None
        and until_timestamp is not None
        and from_timestamp > until_timestamp
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "Invalid audit log date range: "
                "from must be before or equal to until"
            ),
        )

    query = select(AdminAuditLog)
    if action is not None:
        query = query.where(AdminAuditLog.action.contains(action))
    if actor_user_id is not None:
        query = query.where(AdminAuditLog.actor_user_id == actor_user_id)
    if from_timestamp is not None:
        query = query.where(AdminAuditLog.created_at >= from_timestamp)
    if until_timestamp is not None:
        query = query.where(AdminAuditLog.created_at <= until_timestamp)

    entries = session.exec(
        query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc()).limit(
            limit
        )
    ).all()
    return [_to_admin_audit_log_entry(entry) for entry in entries]


@router.get(
    "/packages/stale",
    response_model=list[StalePackageInfo],
)
async def list_stale_packages(
    packages: dict[str, Package] = Depends(get_packages_cache),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
    settings: GameSettings = Depends(get_settings_cache),
) -> list[StalePackageInfo]:
    stale_after_days = settings.content_refresh.stale_after_days
    return detect_stale_packages(
        packages,
        refresh_metadata,
        stale_after_days,
        PACKAGES_DIR,
    )


@router.post(
    "/packages/validate",
    response_model=AdminPackageValidationResponse,
)
async def validate_admin_package(
    body: PublishPackageRequest,
    packages: dict[str, Package] = Depends(get_packages_cache),
) -> AdminPackageValidationResponse:
    return _to_admin_package_validation_response(
        body.yaml_content,
        package_ids=set(packages.keys()),
    )


@router.post(
    "/packages/validate-upload",
    response_model=AdminPackageValidationResponse,
)
async def validate_admin_package_upload(
    file: UploadFile = File(...),
    packages: dict[str, Package] = Depends(get_packages_cache),
) -> AdminPackageValidationResponse:
    yaml_content = _read_uploaded_yaml_file(file)
    return _to_admin_package_validation_response(
        yaml_content,
        package_ids=set(packages.keys()),
    )


@router.post(
    "/packages",
    response_model=AdminPackageSummary,
    status_code=201,
)
async def publish_admin_package(
    body: PublishPackageRequest,
    request: Request,
    session: Session = Depends(get_session),
    packages: dict[str, Package] = Depends(get_packages_cache),
    overrides: dict[str, PackageOverride] = Depends(get_package_overrides),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
) -> AdminPackageSummary:
    if not is_stateless_deployment():
        require_stateful_admin_write()
    validation_result = validate_package_yaml_content(
        body.yaml_content,
        existing_package_ids=set(packages.keys()),
    )
    if not validation_result.valid or validation_result.package is None:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Package validation failed",
                "errors": [
                    AdminPackageValidationIssue(
                        message=issue.message,
                        path=issue.path,
                        line=issue.line,
                        column=issue.column,
                    ).model_dump(mode="json")
                    for issue in validation_result.issues
                ],
                "formatted_errors": [
                    format_package_import_issue(issue)
                    for issue in validation_result.issues
                ],
            },
        )

    pkg = validation_result.package

    now = datetime.now(tz=timezone.utc)
    if is_stateless_deployment():
        try:
            enforce_runtime_package_storage_budget(
                session,
                new_yaml_content=body.yaml_content,
                package_id=pkg.id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        existing_record = refresh_metadata.get(pkg.id)
        save_managed_package_record(
            session,
            package_id=pkg.id,
            yaml_content=body.yaml_content,
            availability="available",
            xp_threshold=None,
            deleted=False,
            added_at=(existing_record.added_at or now) if existing_record else now,
            last_refreshed_at=(
                existing_record.last_refreshed_at if existing_record else None
            ),
            previous_version=(
                existing_record.previous_version if existing_record else None
            ),
            new_version=existing_record.new_version if existing_record else None,
            diff_summary=existing_record.diff_summary if existing_record else None,
            content_hash=compute_package_content_hash(body.yaml_content),
        )
        _sync_stateless_runtime_package_state(request, session)
    else:
        try:
            _write_package_yaml_file(pkg, f"{pkg.id}.yaml")
        except OSError as exc:
            raise HTTPException(
                status_code=500,
                detail="Failed to write package file",
            ) from exc

        packages[pkg.id] = pkg
        request.app.state.packages = packages

        existing_record = refresh_metadata.get(pkg.id)
        if existing_record is None or existing_record.added_at is None:
            refresh_metadata[pkg.id] = PackageAdminMetadataRecord(
                added_at=(existing_record.added_at or now) if existing_record else now,
                last_refreshed_at=(
                    existing_record.last_refreshed_at if existing_record else None
                ),
                refreshed_at=(existing_record.refreshed_at if existing_record else None),
                previous_version=(
                    existing_record.previous_version if existing_record else None
                ),
                new_version=existing_record.new_version if existing_record else None,
                diff_summary=existing_record.diff_summary if existing_record else None,
                content_hash=existing_record.content_hash if existing_record else None,
            )
            save_refresh_metadata(refresh_metadata, REFRESH_METADATA_FILE)
            request.app.state.refresh_metadata = refresh_metadata

    return build_admin_package_summary(
        request.app.state.packages[pkg.id],
        request.app.state.package_overrides.get(pkg.id),
        request.app.state.refresh_metadata.get(pkg.id),
    )


@router.post("/packages/generate", response_model=GenerateResponse)
async def generate_admin_package(
    body: GenerateRequest,
    settings: GameSettings = Depends(get_settings_cache),
) -> GenerateResponse:
    try:
        yaml_content = await generate_package(
            topic=body.topic,
            audience=body.audience,
            num_pages=body.num_pages,
            num_questions=body.num_questions,
            settings=settings,
        )
    except Exception as exc:
        if _get_ai_error_code(exc) == AI_ERROR_CODE_MISSING_API_KEY:
            raise HTTPException(
                status_code=503,
                detail=_build_ai_error_detail(exc),
            ) from exc
        raise HTTPException(
            status_code=502,
            detail=_build_ai_error_detail(exc),
        ) from exc

    return GenerateResponse(yaml_content=yaml_content)


@router.post(
    "/packages/{package_id}/refresh",
    response_model=RefreshResult,
)
async def refresh_admin_package(
    package_id: str,
    request: Request,
    dry_run: bool = False,
    session: Session = Depends(get_session),
    packages: dict[str, Package] = Depends(get_packages_cache),
    refresh_metadata: dict[str, PackageAdminMetadataRecord] = Depends(
        get_refresh_metadata_cache
    ),
    settings: GameSettings = Depends(get_settings_cache),
) -> RefreshResult:
    if not is_stateless_deployment():
        require_stateful_admin_write()
    pkg = packages.get(package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    try:
        new_yaml = await refresh_package(pkg, settings=settings)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=_build_ai_error_detail(exc),
        ) from exc

    try:
        raw = yaml.safe_load(new_yaml)
        new_pkg = Package.model_validate(raw)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=422, detail=f"YAML parse error: {exc}") from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"message": "Schema validation failed", "errors": exc.errors()},
        ) from exc

    new_pkg_patched = new_pkg.model_copy(
        update={"id": pkg.id, "version": _bump_patch_version(pkg.version)}
    )
    diff = compute_diff_summary(pkg, new_pkg_patched)

    if dry_run:
        return RefreshResult(
            package_id=package_id,
            previous_version=pkg.version,
            new_version=new_pkg_patched.version,
            diff_summary=diff,
            dry_run=True,
        )

    now = datetime.now(tz=timezone.utc)
    if is_stateless_deployment():
        final_yaml = serialise_package_yaml(new_pkg_patched)
        try:
            enforce_runtime_package_storage_budget(
                session,
                new_yaml_content=final_yaml,
                package_id=package_id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        current_override = request.app.state.package_overrides.get(
            package_id, PackageOverride()
        )
        save_managed_package_record(
            session,
            package_id=package_id,
            yaml_content=final_yaml,
            availability=resolve_effective_availability(current_override),
            xp_threshold=current_override.xp_threshold,
            deleted=False,
            added_at=(
                refresh_metadata.get(package_id).added_at
                if refresh_metadata.get(package_id)
                else now
            ),
            last_refreshed_at=now,
            previous_version=pkg.version,
            new_version=new_pkg_patched.version,
            diff_summary=diff,
            content_hash=compute_package_content_hash(final_yaml),
        )
        _sync_stateless_runtime_package_state(request, session)
        record = request.app.state.refresh_metadata[package_id]
    else:
        try:
            _, record = write_refreshed_package(
                package_id,
                new_yaml,
                PACKAGES_DIR,
                pkg,
                refresh_metadata,
                REFRESH_METADATA_FILE,
                now,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        packages[package_id] = new_pkg_patched
        request.app.state.packages = packages
        request.app.state.refresh_metadata = refresh_metadata

    return RefreshResult(
        package_id=package_id,
        previous_version=pkg.version,
        new_version=new_pkg_patched.version,
        diff_summary=diff,
        dry_run=False,
        refreshed_at=record.refreshed_at,
    )
