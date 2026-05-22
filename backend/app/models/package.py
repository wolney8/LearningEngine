from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, model_validator


class Answer(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class Page(BaseModel):
    id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)


class Question(BaseModel):
    id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    answers: Annotated[list[Answer], Field(min_length=2, max_length=6)]
    correct_answer: str = Field(min_length=1)
    weight: float = Field(gt=0)
    feedback: str = Field(min_length=1)
    revision_page_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def correct_answer_must_exist(self) -> "Question":
        answer_ids = {a.id for a in self.answers}
        if self.correct_answer not in answer_ids:
            raise ValueError(
                f"correct_answer '{self.correct_answer}' does not match any answer id"
            )
        return self


class Package(BaseModel):
    id: Annotated[str, Field(pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$")]
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    version: Annotated[str, Field(pattern=r"^\d+\.\d+\.\d+$")]
    tags: list[str] = Field(default_factory=list)
    passing_score: float = Field(default=0.80, ge=0.0, le=1.0)
    pages: Annotated[list[Page], Field(min_length=1)]
    questions: Annotated[list[Question], Field(min_length=1)]

    @model_validator(mode="after")
    def revision_page_ids_must_exist(self) -> "Package":
        page_ids = {p.id for p in self.pages}
        for question in self.questions:
            for rpid in question.revision_page_ids:
                if rpid not in page_ids:
                    raise ValueError(
                        f"revision_page_id '{rpid}' in question '{question.id}' "
                        f"does not match any page id"
                    )

        total_weight = sum(question.weight for question in self.questions)
        if abs(total_weight - 100.0) >= 0.01:
            raise ValueError(
                f"question weights must sum to 100, got {total_weight:.2f}"
            )
        return self


class PackageSummary(BaseModel):
    id: str
    title: str
    description: str
    version: str
    tags: list[str]
    passing_score: float
    page_count: int
    question_count: int
