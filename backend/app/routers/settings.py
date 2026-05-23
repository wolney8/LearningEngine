from fastapi import APIRouter, Depends, Request

from app.models.settings import GameSettings

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_settings(request: Request) -> GameSettings:
    """Dependency that extracts game settings from app.state."""
    return request.app.state.settings


@router.get("", response_model=GameSettings)
async def read_settings(
    settings: GameSettings = Depends(get_settings),
) -> GameSettings:
    return settings
