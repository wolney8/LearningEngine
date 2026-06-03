# Package Creation Prompt

## How to use

1. Copy the prompt below.
2. Paste it into an AI assistant.
3. Fill in the placeholders.
4. Save the result as `<package-id>.yaml` in `packages/`.
5. Validate it through the backend load or validation flow before publishing.

If using the in-app admin AI workflow, provider configuration is controlled through backend environment variables such as `GEMINI_API_KEY` and `GEMINI_MODEL`.

> **Schema reference:** `docs/CONTENT_PACKAGE_TEMPLATE.md`

## Prompt

```text
You are a learning content author. Generate a YAML learning package that conforms exactly to the schema below.

TOPIC: [TOPIC]
TARGET AUDIENCE: [TARGET_AUDIENCE]
NUMBER OF QUESTIONS: [NUMBER_OF_QUESTIONS]

SCHEMA RULES

The output must be a single valid YAML document.

Top-level fields:
  id: string — lowercase, alphanumeric, hyphens only
  title: string — human-readable display name
  description: string — short summary
  version: string — use "1.0.0" for new packages unless told otherwise
  tags: list of strings — relevant topic labels
  passing_score: number — decimal threshold between 0.0 and 1.0
  pages: list of Page objects
  questions: list of Question objects

Page object:
  id: string — unique within the package
  title: string — page heading
  content: string — Markdown content is allowed

Question object:
  id: string — unique within the package
  difficulty: optional; if used, every question should use one of easy, normal, hard, expert
  text: string — question prompt
  answers: list of Answer objects — provide between 2 and 6 answers
  correct_answer: string — must match an answer id in that question
  weight: number — positive; total weight must sum to 100 overall, or to 100 within each difficulty group if difficulty tagging is used
  feedback: string — explain why the correct answer is right
  revision_page_ids: list of strings — should refer to real page ids

Answer object:
  id: string — unique within the question
  text: string — answer option text

QUALITY RULES

- Keep the content educational and accurate.
- Use plausible distractors.
- Ensure all revision page ids exist.
- Return only raw YAML with no code fences or commentary.
```

## Common validation failures

- weights do not sum correctly
- `correct_answer` does not match any answer id
- `revision_page_ids` points to a missing page id
- `id` contains invalid characters
- difficulty tags are mixed inconsistently
