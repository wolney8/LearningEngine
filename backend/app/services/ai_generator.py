"""AI package generator using pydantic-ai with Google Gemini."""

from __future__ import annotations

import os
import re
from typing import Literal

import yaml
from pydantic_ai import Agent
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.models.groq import GroqModel
from pydantic_ai.models.mistral import MistralModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.google_gla import GoogleGLAProvider
from pydantic_ai.providers.groq import GroqProvider
from pydantic_ai.providers.mistral import MistralProvider
from pydantic_ai.providers.openai import OpenAIProvider

from app.models.package import Package
from app.models.settings import AIProviderName, GameSettings
from app.services.ai_key_store import (
    get_ai_key_store_file,
    resolve_ai_api_key,
)

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
REFRESH_MAX_ATTEMPTS = 3
MIN_CHANGED_PAGE_RATIO = 0.5
MIN_CHANGED_QUESTION_RATIO = 0.5
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
_GENERIC_TAGS = {
    "ai",
    "ai-course",
    "ai-generated",
    "course",
    "courses",
    "general",
    "general-audience",
    "general-learning",
    "general-learners",
    "learners",
    "learning",
    "training",
    "existing-audience",
}
_GENERIC_TAG_COMPONENTS = {
    "a",
    "an",
    "and",
    "audience",
    "basics",
    "beginners",
    "course",
    "for",
    "general",
    "intro",
    "introduction",
    "learners",
    "learning",
    "new",
    "skills",
    "the",
    "training",
}


AI_KEY_STORE_FILE = get_ai_key_store_file()


def _normalise_text(value: str) -> str:
    return " ".join(value.lower().split())


def _refresh_quality_issues(existing: Package, candidate: Package) -> list[str]:
    issues: list[str] = []

    if len(candidate.pages) != len(existing.pages):
        issues.append(
            "page count changed; refreshed package must keep the same number of pages"
        )

    if len(candidate.questions) != len(existing.questions):
        issues.append(
            "question count changed; refreshed package must keep the same "
            "number of questions"
        )

    comparable_pages = min(len(existing.pages), len(candidate.pages))
    if comparable_pages > 0:
        changed_pages = sum(
            1
            for idx in range(comparable_pages)
            if _normalise_text(
                f"{existing.pages[idx].title}\n{existing.pages[idx].content}"
            )
            != _normalise_text(
                f"{candidate.pages[idx].title}\n{candidate.pages[idx].content}"
            )
        )
        changed_page_ratio = changed_pages / comparable_pages
        if changed_page_ratio < MIN_CHANGED_PAGE_RATIO:
            issues.append(
                "insufficient page variation; at least 50% of pages must change"
            )

    comparable_questions = min(len(existing.questions), len(candidate.questions))
    if comparable_questions > 0:
        changed_questions = sum(
            1
            for idx in range(comparable_questions)
            if _normalise_text(existing.questions[idx].text)
            != _normalise_text(candidate.questions[idx].text)
        )
        changed_question_ratio = changed_questions / comparable_questions
        if changed_question_ratio < MIN_CHANGED_QUESTION_RATIO:
            issues.append(
                "insufficient question variation; at least 50% of question "
                "text must change"
            )

    normalised_question_texts = [
        _normalise_text(question.text) for question in candidate.questions
    ]
    if len(set(normalised_question_texts)) != len(normalised_question_texts):
        issues.append("duplicate questions detected in refreshed package")

    tagged_questions = [
        question for question in candidate.questions if question.difficulty is not None
    ]
    if tagged_questions:
        represented_difficulties = {
            question.difficulty for question in tagged_questions if question.difficulty
        }
        required_difficulties = {"easy", "normal", "hard", "expert"}
        missing_difficulties = sorted(required_difficulties - represented_difficulties)
        if missing_difficulties:
            issues.append(
                "missing difficulty coverage in tagged questions: "
                + ", ".join(missing_difficulties)
            )

    return issues


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


def _is_generic_tag(tag: str) -> bool:
    normalised = _slugify_tag(tag)
    if not normalised:
        return True
    if normalised in _GENERIC_TAGS:
        return True
    components = [part for part in normalised.split("-") if part]
    if not components:
        return True
    if all(component in _GENERIC_TAG_COMPONENTS for component in components):
        return True
    return False


def _extract_keyword_tags(value: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", value.lower())
    deduped: list[str] = []
    seen: set[str] = set()
    for word in words:
        if len(word) < 4 or word in _GENERIC_TAG_COMPONENTS:
            continue
        if word in seen:
            continue
        seen.add(word)
        deduped.append(word)
    return deduped


def _derive_informative_tags(*sources: str) -> list[str]:
    candidates: list[str] = []
    for source in sources:
        slug = _slugify_tag(source)
        if slug and not _is_generic_tag(slug):
            candidates.append(slug)
        candidates.extend(_extract_keyword_tags(source))

    tags = _normalise_tags(candidates)
    filtered = [tag for tag in tags if not _is_generic_tag(tag)]
    if filtered:
        return filtered[:8]
    return ["subject-matter", "skills-practice"]


def _resolve_output_tags(existing_tags: object, *fallback_sources: str) -> list[str]:
    generated_tags = [
        tag for tag in _normalise_tags(existing_tags) if not _is_generic_tag(tag)
    ]
    if generated_tags:
        return generated_tags
    return _derive_informative_tags(*fallback_sources)


def get_recommended_ai_model(provider: AIProviderName) -> str:
    return AI_PROVIDER_DEFAULT_MODELS[provider]


def _with_tags(pkg: Package, tags: list[str]) -> Package:
    return pkg.model_copy(update={"tags": tags})


def _resolve_provider_and_model(
    settings: GameSettings | None,
    provider_override: AIProviderName | None,
    model_override: str | None,
) -> tuple[AIProviderName, str]:
    configured_provider = (
        settings.ai.provider if settings is not None else DEFAULT_AI_PROVIDER
    )
    configured_model = (
        settings.ai.model if settings is not None else None
    )

    provider = provider_override or configured_provider
    model_name = (
        model_override
        or configured_model
        or os.getenv("GEMINI_MODEL")
        or get_recommended_ai_model(provider)
    )

    if provider not in SUPPORTED_AI_PROVIDERS:
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
    provider_override: AIProviderName | None = None,
    model_override: str | None = None,
    api_key_override: str | None = None,
) -> Agent[None, Package]:
    provider_name, model_name = _resolve_provider_and_model(
        settings=settings,
        provider_override=provider_override,
        model_override=model_override,
    )

    resolved_api_key, _, _, _ = resolve_ai_api_key(
        provider_name,
        key_store_file=AI_KEY_STORE_FILE,
    )
    api_key = api_key_override or resolved_api_key
    if not api_key:
        raise AIGenerationError(
            "AI service is not configured.",
            error_code=AI_ERROR_CODE_MISSING_API_KEY,
        )

    if provider_name == "gemini":
        provider = GoogleGLAProvider(api_key=api_key)
        model = GeminiModel(model_name, provider=provider)
    elif provider_name == "openai":
        provider = OpenAIProvider(api_key=api_key)
        model = OpenAIChatModel(model_name, provider=provider)
    elif provider_name == "anthropic":
        provider = AnthropicProvider(api_key=api_key)
        model = AnthropicModel(model_name, provider=provider)
    elif provider_name == "groq":
        provider = GroqProvider(api_key=api_key)
        model = GroqModel(model_name, provider=provider)
    else:
        provider = MistralProvider(api_key=api_key)
        model = MistralModel(model_name, provider=provider)

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
        "Generate 4-8 concise, specific discovery tags tied to the subject matter "
        "and audience. Do not use generic placeholder tags such as "
        "'ai-generated', 'general-learning', or 'general-learners'.\n"
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
    pkg = _with_tags(pkg, _resolve_output_tags(pkg.tags, pkg.title, topic, audience))

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
    base_prompt = (
        f"Refresh the training package titled: {existing.title}\n"
        f"Original description: {existing.description}\n"
        f"Include exactly {len(existing.pages)} pages and "
        f"exactly {len(existing.questions)} questions.\n"
        "Return 4-8 concise, specific discovery tags for the refreshed content. "
        "Do not use generic placeholder tags such as 'ai-generated' or "
        "'general-learning'.\n"
        "Generate completely new, fresh content on the same topic. "
        "Do NOT reuse existing question text or page content verbatim.\n"
        "Distribute questions evenly across all four difficulty levels. "
        "Within each difficulty group, weights must sum to exactly 100."
    )

    quality_issues: list[str] = []
    pkg: Package | None = None

    for attempt in range(1, REFRESH_MAX_ATTEMPTS + 1):
        prompt = base_prompt
        if quality_issues:
            remediation_notes = "\n".join(f"- {issue}" for issue in quality_issues)
            prompt += (
                "\n\nPrevious refresh attempt did not meet quality requirements. "
                "Correct all issues below whilst preserving topic and constraints:\n"
                f"{remediation_notes}"
            )

        try:
            result = await agent.run(prompt)
        except Exception as exc:
            raise AIGenerationError(
                "AI provider request failed.",
                error_code=_classify_provider_failure(exc),
            ) from exc

        candidate: Package = result.output
        quality_issues = _refresh_quality_issues(existing, candidate)
        if not quality_issues:
            pkg = candidate
            break

        if attempt == REFRESH_MAX_ATTEMPTS:
            break

    if pkg is None:
        raise AIGenerationError(
            "AI refresh output did not meet quality requirements: "
            + "; ".join(quality_issues)
        )

    pkg = _with_tags(
        pkg,
        _resolve_output_tags(
            pkg.tags,
            *existing.tags,
            existing.title,
            existing.description,
        ),
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
    api_key: str | None = None,
    provider_override: AIProviderName | None = None,
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
