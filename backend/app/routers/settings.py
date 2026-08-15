from fastapi import APIRouter, Depends, Request

from app.models.settings import GameSettings

router = APIRouter(tags=["settings"])


def get_settings(request: Request) -> GameSettings:
    """Dependency that extracts game settings from app.state."""
    return request.app.state.settings


@router.get("/settings", response_model=GameSettings)
async def read_settings(
    settings: GameSettings = Depends(get_settings),
) -> GameSettings:
    return settings


@router.get("/api/settings", response_model=GameSettings, include_in_schema=False)
async def read_settings_legacy(
    settings: GameSettings = Depends(get_settings),
) -> GameSettings:
    return settings
