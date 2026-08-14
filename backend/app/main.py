import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.packages import router as packages_router
from app.routers.settings import router as settings_router
from app.routers.users import router as users_router
from app.services.db import engine, init_db
from app.services.deployment_mode import is_stateless_deployment
from app.services.overrides_loader import load_package_overrides
from app.services.package_loader import PACKAGES_DIR, load_packages
from app.services.refresh_metadata_loader import (
    load_refresh_metadata,
)
from app.services.runtime_package_store import load_runtime_package_state
from app.services.settings_loader import load_settings

DEFAULT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=os.getenv("APP_ENV_FILE", str(DEFAULT_ENV_FILE)), override=True)

logger = logging.getLogger(__name__)


def _get_allowed_origins() -> list[str]:
    raw_origins = os.getenv("BACKEND_CORS_ORIGINS")
    if raw_origins is None:
        return ["http://localhost:5173"]

    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return origins or ["http://localhost:5173"]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager.

    Phase 1 stub: logs startup and shutdown only.
    YAML package loading is added in Phase 3 (OA-001 resolved).
    """
    logger.info("startup")
    init_db()
    app.state.settings = load_settings()
    seed_packages = load_packages()
    app.state.seed_packages = seed_packages
    refresh_metadata = load_refresh_metadata()
    if is_stateless_deployment():
        with Session(engine) as session:
            runtime_state = load_runtime_package_state(seed_packages, session)
        app.state.packages = runtime_state.packages
        app.state.package_overrides = runtime_state.overrides
        app.state.refresh_metadata = runtime_state.refresh_metadata
    else:
        app.state.packages = seed_packages
        app.state.package_overrides = load_package_overrides()
        from app.services.refresh_metadata_loader import ensure_package_metadata_records

        app.state.refresh_metadata = ensure_package_metadata_records(
            seed_packages,
            refresh_metadata,
            PACKAGES_DIR,
        )
    yield
    logger.info("shutdown")


app = FastAPI(title="Local Learning Engine", lifespan=lifespan)


@app.middleware("http")
async def strip_api_prefix_for_routed_deployments(request, call_next):
    if request.scope["path"] == "/api":
        request.scope["path"] = "/"
        request.scope["raw_path"] = b"/"
    elif request.scope["path"].startswith("/api/"):
        trimmed_path = request.scope["path"][4:] or "/"
        request.scope["path"] = trimmed_path
        request.scope["raw_path"] = trimmed_path.encode("utf-8")
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(packages_router)
app.include_router(settings_router)
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(users_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness check. Returns HTTP 200 with status ok."""
    return {"status": "ok"}
