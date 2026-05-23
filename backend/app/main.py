import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.packages import router as packages_router
from app.routers.settings import router as settings_router
from app.services.package_loader import load_packages
from app.services.settings_loader import load_settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager.

    Phase 1 stub: logs startup and shutdown only.
    YAML package loading is added in Phase 3 (OA-001 resolved).
    """
    logger.info("startup")
    app.state.settings = load_settings()
    app.state.packages = load_packages()
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


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness check. Returns HTTP 200 with status ok."""
    return {"status": "ok"}
