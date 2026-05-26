from __future__ import annotations

import logging
import tempfile
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.models.refresh import PackageRefreshRecord, RefreshMetadataDocument

log = logging.getLogger(__name__)

REFRESH_METADATA_FILE = (
    Path(__file__).resolve().parent.parent.parent / "package-refresh-metadata.yaml"
)


def load_refresh_metadata(
    file: Path = REFRESH_METADATA_FILE,
) -> dict[str, PackageRefreshRecord]:
    """Load refresh metadata. Return empty dict if file is missing or corrupt."""
    if not file.exists():
        return {}
    try:
        raw = yaml.safe_load(file.read_text(encoding="utf-8")) or {}
        doc = RefreshMetadataDocument.model_validate(raw)
        return doc.packages
    except (yaml.YAMLError, ValidationError, OSError) as exc:
        log.warning("Could not load refresh metadata from %s: %s", file, exc)
        return {}


def save_refresh_metadata(
    metadata: dict[str, PackageRefreshRecord],
    file: Path = REFRESH_METADATA_FILE,
) -> None:
    """Atomically write refresh metadata to disk."""
    doc = RefreshMetadataDocument(packages=metadata)
    content = yaml.dump(
        doc.model_dump(mode="json"),
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
    file.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=file.parent,
        delete=False,
        suffix=".tmp",
    ) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    tmp_path.replace(file)
