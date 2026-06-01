"""AI package generator using pydantic-ai with Google Gemini."""

from __future__ import annotations

import os
import re
from typing import Literal

import yaml
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.providers.google_gla import GoogleGLAProvider

from app.models.package import Package
from app.models.settings import GameSettings

_SYSTEM_PROMPT = """\
You are an expert instructional designer creating training packages for a
learning management system.

Generate a complete training package as a structured object.

STRICT CONSTRAINTS:
- Each question MUST have at least 2 and at most 6 answers
- correct_answer MUST match one of the answer ids for that question
- revision_page_ids MUST only reference page ids that exist in the package
- id fields must be kebab-case slugs (lowercase letters, numbers, hyphens only)
- version must be "1.0.0"
- passing_score between 0.0 and 1.0 (default 0.8)
- All text content should be educational, accurate, and appropriate for the
    specified audience
- Page content should be written in Markdown with clear headings and examples

QUESTION DIFFICULTY TAGGING:
- Every question MUST have a `difficulty` field set to exactly one of:
    "easy", "normal", "hard", or "expert".
- You MUST generate questions for ALL FOUR difficulty levels.
- Within each difficulty group, the question weights MUST independently sum to
    exactly 100.
  Distribute evenly; the last question in each group absorbs any rounding remainder.
- Cognitive complexity guidelines:
    easy:   Basic recall; single-concept, factual questions.
        e.g. "What keyword is used to define a function?"
    normal: Understanding; reasoning about how a concept works.
        e.g. "Why does Python use indentation instead of braces?"
    hard:   Analysis; synthesis of 2+ concepts, edge cases, unexpected behaviour.
        e.g. "What is the output of: [x for x in range(5) if x % 2 == 0][3]?"
    expert: Advanced; nuanced, ambiguous scenarios requiring deep expertise.
        e.g. "In CPython, why does `is` return True for small integers but not
        large ones?"
"""

AI_ERROR_CODE_MISSING_API_KEY = "ai_missing_api_key"
AI_ERROR_CODE_PROVIDER_OVERLOADED = "ai_provider_overloaded"
AI_ERROR_CODE_PROVIDER_UNAVAILABLE = "ai_provider_unavailable"
AI_ERROR_CODE_UPSTREAM_FAILURE = "ai_upstream_failure"


class AIGenerationError(Exception):
    """Raised when the AI generator fails to produce a valid package."""

    def __init__(
        self,
        message: str,
        *,
        error_code: str = AI_ERROR_CODE_UPSTREAM_FAILURE,
    ):
        super().__init__(message)
        self.error_code = error_code


DEFAULT_AI_PROVIDER: Literal["gemini"] = "gemini"
DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-exp"


def _normalise_tags(raw_tags: object) -> list[str]:
    if not isinstance(raw_tags, list):
        return []

    normalised: list[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        if not isinstance(raw_tag, str):
            continue
        tag = raw_tag.strip()
        if not tag:
            continue
        dedupe_key = tag.casefold()
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalised.append(tag)
    return normalised


def _slugify_tag(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")
    return slug


def _fallback_generation_tags(topic: str, audience: str) -> list[str]:
    candidates: list[str] = []
    topic_tag = _slugify_tag(topic)
    audience_tag = _slugify_tag(audience)

    if topic_tag:
        candidates.append(topic_tag)
    if audience_tag:
        candidates.append(f"audience-{audience_tag}")
    candidates.append("ai-generated")

    fallback = _normalise_tags(candidates)
    if fallback:
        return fallback
    return ["ai-generated", "general-learning"]


def _with_tags(pkg: Package, tags: list[str]) -> Package:
    return pkg.model_copy(update={"tags": tags})


def _resolve_provider_and_model(
    settings: GameSettings | None,
    provider_override: Literal["gemini"] | None,
    model_override: str | None,
) -> tuple[Literal["gemini"], str]:
    configured_provider = (
        settings.ai.provider if settings is not None else DEFAULT_AI_PROVIDER
    )
    configured_model = (
        settings.ai.model if settings is not None else None
    )

    provider = provider_override or configured_provider
    model_name = model_override or configured_model or os.getenv(
        "GEMINI_MODEL", DEFAULT_GEMINI_MODEL
    )

    if provider != "gemini":
        raise AIGenerationError("Unsupported AI provider")

    return provider, model_name


def _extract_status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code

    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    if isinstance(response_status, int):
        return response_status

    return None


def _classify_provider_failure(exc: Exception) -> str:
    status_code = _extract_status_code(exc)
    if status_code == 429:
        return AI_ERROR_CODE_PROVIDER_OVERLOADED
    if status_code in {502, 503, 504}:
        return AI_ERROR_CODE_PROVIDER_UNAVAILABLE

    text = f"{type(exc).__name__} {exc}".casefold()
    overloaded_markers = (
        "overload",
        "overloaded",
        "high demand",
        "too many requests",
        "rate limit",
        "quota",
        "capacity",
        "busy",
    )
    unavailable_markers = (
        "unavailable",
        "service unavailable",
        "temporarily unavailable",
        "timeout",
        "timed out",
        "bad gateway",
        "gateway timeout",
    )

    if any(marker in text for marker in overloaded_markers):
        return AI_ERROR_CODE_PROVIDER_OVERLOADED
    if any(marker in text for marker in unavailable_markers):
        return AI_ERROR_CODE_PROVIDER_UNAVAILABLE
    return AI_ERROR_CODE_UPSTREAM_FAILURE


def _get_agent(
    *,
    settings: GameSettings | None = None,
    provider_override: Literal["gemini"] | None = None,
    model_override: str | None = None,
    api_key_override: str | None = None,
) -> Agent[None, Package]:
    _, model_name = _resolve_provider_and_model(
        settings=settings,
        provider_override=provider_override,
        model_override=model_override,
    )

    api_key = api_key_override or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AIGenerationError(
            "AI service is not configured.",
            error_code=AI_ERROR_CODE_MISSING_API_KEY,
        )

    provider = GoogleGLAProvider(api_key=api_key)
    model = GeminiModel(model_name, provider=provider)
    return Agent(model=model, output_type=Package, system_prompt=_SYSTEM_PROMPT)


async def generate_package(
    topic: str,
    audience: str,
    num_pages: int,
    num_questions: int,
    settings: GameSettings | None = None,
) -> str:
    """Generate a Package from a topic description and return it as a YAML string.

    Returns:
        A valid YAML string for the generated package.

    Raises:
        AIGenerationError: if the API key is missing, the API call fails,
            or the response fails Pydantic validation.
    """
    agent = _get_agent(settings=settings)
    prompt = (
        f"Create a training package about: {topic}\n"
        f"Target audience: {audience}\n"
        f"Include exactly {num_pages} pages and exactly {num_questions} questions.\n"
        "Distribute questions evenly across all four difficulty levels "
        f"(aim for {num_questions // 4} per group, adjust the last group "
        f"if {num_questions} is not divisible by 4). "
        "Within each difficulty group, weights must sum to exactly 100."
    )

    try:
        result = await agent.run(prompt)
    except Exception as exc:
        raise AIGenerationError(
            "AI provider request failed.",
            error_code=_classify_provider_failure(exc),
        ) from exc

    pkg: Package = result.output
    generated_tags = _normalise_tags(pkg.tags)
    if generated_tags:
        pkg = _with_tags(pkg, generated_tags)
    else:
        pkg = _with_tags(pkg, _fallback_generation_tags(topic, audience))

    pkg_dict = pkg.model_dump(mode="python")
    return yaml.dump(
        pkg_dict,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


async def refresh_package(
    existing: Package,
    settings: GameSettings | None = None,
) -> str:
    """Re-generate content for an existing package, preserving its id and identity."""
    agent = _get_agent(settings=settings)
    prompt = (
        f"Refresh the training package titled: {existing.title}\n"
        f"Original description: {existing.description}\n"
        f"Include exactly {len(existing.pages)} pages and "
        f"exactly {len(existing.questions)} questions.\n"
        "Generate completely new, fresh content on the same topic. "
        "Do NOT reuse existing question text or page content verbatim.\n"
        "Distribute questions evenly across all four difficulty levels. "
        "Within each difficulty group, weights must sum to exactly 100."
    )

    try:
        result = await agent.run(prompt)
    except Exception as exc:
        raise AIGenerationError(
            "AI provider request failed.",
            error_code=_classify_provider_failure(exc),
        ) from exc

    pkg: Package = result.output
    generated_tags = _normalise_tags(pkg.tags)
    if generated_tags:
        pkg = _with_tags(pkg, generated_tags)
    else:
        existing_tags = _normalise_tags(existing.tags)
        if existing_tags:
            pkg = _with_tags(pkg, existing_tags)
        else:
            pkg = _with_tags(
                pkg,
                _fallback_generation_tags(existing.title, "existing-audience"),
            )

    pkg_dict = pkg.model_dump(mode="python")
    return yaml.dump(
        pkg_dict,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


async def test_connection(
    *,
    settings: GameSettings,
    api_key: str,
    provider_override: Literal["gemini"] | None = None,
    model_override: str | None = None,
) -> str:
    _, model_name = _resolve_provider_and_model(
        settings=settings,
        provider_override=provider_override,
        model_override=model_override,
    )

    agent = _get_agent(
        settings=settings,
        provider_override=provider_override,
        model_override=model_override,
        api_key_override=api_key,
    )
    try:
        await agent.run("Reply with exactly: ok")
    except Exception as exc:
        raise AIGenerationError(
            "Connection test failed. Check provider, model, and API key.",
            error_code=_classify_provider_failure(exc),
        ) from exc

    return model_name
