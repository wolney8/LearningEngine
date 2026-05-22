"""AI package generator using pydantic-ai with Google Gemini."""

from __future__ import annotations

import os

import yaml
from dotenv import load_dotenv
from pydantic_ai import Agent
from pydantic_ai.models.gemini import GeminiModel

from app.models.package import Package

load_dotenv()

_SYSTEM_PROMPT = """\
You are an expert instructional designer creating training packages for a
learning management system.

Generate a complete training package as a structured object.

STRICT CONSTRAINTS:
- question weights MUST sum to exactly 100 (distribute evenly; last question
    absorbs rounding remainder)
- Each question MUST have at least 2 and at most 6 answers
- correct_answer MUST match one of the answer ids for that question
- revision_page_ids MUST only reference page ids that exist in the package
- id fields must be kebab-case slugs (lowercase letters, numbers, hyphens only)
- version must be "1.0.0"
- passing_score between 0.0 and 1.0 (default 0.8)
- All text content should be educational, accurate, and appropriate for the
    specified audience
- Page content should be written in Markdown with clear headings and examples
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
        "Make sure weights sum to exactly 100."
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
