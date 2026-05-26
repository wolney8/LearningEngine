import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.packages import router as packages_router
from app.routers.settings import router as settings_router
from app.routers.users import router as users_router
from app.services.db import init_db
from app.services.overrides_loader import load_package_overrides
from app.services.package_loader import load_packages
from app.services.refresh_metadata_loader import load_refresh_metadata
from app.services.settings_loader import load_settings

load_dotenv(override=True)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager.

    Phase 1 stub: logs startup and shutdown only.
    YAML package loading is added in Phase 3 (OA-001 resolved).
    """
    logger.info("startup")
    init_db()
    app.state.settings = load_settings()
    app.state.packages = load_packages()
    app.state.package_overrides = load_package_overrides()
    app.state.refresh_metadata = load_refresh_metadata()
    yield
    logger.info("shutdown")


app = FastAPI(title="Local Learning Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
