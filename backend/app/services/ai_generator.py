"""AI package generator using pydantic-ai with Google Gemini."""

from __future__ import annotations

import os

import yaml
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel

from app.models.package import Package

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


class AIGenerationError(Exception):
    """Raised when the AI generator fails to produce a valid package."""


def _get_agent() -> Agent[None, Package]:
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-exp")
    if not api_key:
        raise AIGenerationError("GEMINI_API_KEY is not set. Add it to backend/.env")

    model = GeminiModel(model_name, api_key=api_key)
    return Agent(model=model, output_type=Package, system_prompt=_SYSTEM_PROMPT)


async def generate_package(
    topic: str,
    audience: str,
    num_pages: int,
    num_questions: int,
) -> str:
    """Generate a Package from a topic description and return it as a YAML string.

    Returns:
        A valid YAML string for the generated package.

    Raises:
        AIGenerationError: if the API key is missing, the API call fails,
            or the response fails Pydantic validation.
    """
    agent = _get_agent()
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
        raise AIGenerationError(f"Gemini API call failed: {exc}") from exc

    pkg: Package = result.output
    pkg_dict = pkg.model_dump(mode="python")
    return yaml.dump(
        pkg_dict,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )


async def refresh_package(existing: Package) -> str:
    """Re-generate content for an existing package, preserving its id and identity."""
    agent = _get_agent()
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
        raise AIGenerationError(f"Gemini API call failed: {exc}") from exc

    pkg: Package = result.output
    pkg_dict = pkg.model_dump(mode="python")
    return yaml.dump(
        pkg_dict,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    )
