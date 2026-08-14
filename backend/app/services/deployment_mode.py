from __future__ import annotations

import os
from typing import Literal

from fastapi import HTTPException

DeploymentMode = Literal["stateful", "stateless"]

STATEFUL = "stateful"
STATELESS = "stateless"


def get_deployment_mode() -> DeploymentMode:
    raw_value = os.getenv("APP_DEPLOYMENT_MODE", STATEFUL).strip().lower()
    if raw_value == STATELESS:
        return STATELESS
    return STATEFUL


def is_stateless_deployment() -> bool:
    return get_deployment_mode() == STATELESS


def stateless_admin_write_message() -> str:
    return (
        "This admin action is unavailable in stateless deployments such as Vercel. "
        "Use the stateful local or k3s deployment for settings, package, and "
        "runtime key persistence."
    )


def require_stateful_admin_write() -> None:
    if not is_stateless_deployment():
        return

    raise HTTPException(status_code=409, detail=stateless_admin_write_message())
