# Package Creation Prompt

## How to Use

1. Copy the prompt below.
2. Paste it into any AI assistant (ChatGPT, Claude, Gemini, or a locally running model via Ollama).
3. Fill in the `[TOPIC]`, `[TARGET_AUDIENCE]`, and `[NUMBER_OF_QUESTIONS]` placeholders before sending.
4. The AI will return a YAML block. Save it as `<package-id>.yaml` in the `packages/` directory.
5. The app validates the file on startup - any schema error will be reported in the backend log.

> **Schema version:** 1.0 (matches `docs/CONTENT_PACKAGE_TEMPLATE.md`). Update this prompt whenever the schema changes.

## Open Questions That Affect Prompt Output

- OQ-001: Content field currently accepts plain text only. If Markdown support is added, update the "content" field instructions in the prompt below.

---

## Prompt

```
You are a learning content author. Generate a YAML learning package that conforms exactly to the schema below.

TOPIC: [TOPIC — e.g. "Introduction to DNS", "Python list comprehensions", "TCP/IP networking basics"]
TARGET AUDIENCE: [TARGET_AUDIENCE — e.g. "beginners with no prior knowledge", "junior software engineers"]
NUMBER OF QUESTIONS: [NUMBER_OF_QUESTIONS — must be between 3 and 20]

---

SCHEMA RULES

The output must be a single valid YAML document. Follow every rule exactly.

Top-level fields:
  id:            string — lowercase, alphanumeric, hyphens only (e.g. "intro-to-dns")
  title:         string — human-readable display name
  description:   string — one or two sentences summarising the package
  version:       string — always "1.0.0" for new packages
  tags:          list of strings — relevant topic labels
  passing_score: number — minimum weighted percentage to pass; recommend 60 for beginner topics, 70 for intermediate
  pages:         list of Page objects (see below)
  questions:     list of Question objects (see below)

Page object:
  id:      string — unique within this package, e.g. "page-1", "page-2"
  title:   string — page heading
  content: string — body text; plain text only, no Markdown; use \n for line breaks within the string if needed

Question object:
  id:             string — unique within this package, e.g. "q1", "q2"
  text:           string — the question presented to the user
  answers:        list of Answer objects — provide exactly 4 answers per question
  correct_answer: string — must match the id of one Answer in this question's answers list
  weight:         number — scoring weight; all weights across all questions MUST sum to exactly 100
  feedback:       string — shown after submission; explain why the correct answer is right in one or two sentences
  revision_page_ids: list of strings — ids of pages to recommend for revision if this question is answered incorrectly; list at least one

Answer object:
  id:   string — unique within this question, e.g. "a", "b", "c", "d"
  text: string — the answer option shown to the user

---

QUALITY RULES

- All page content must be genuinely educational and accurate for the stated topic and audience.
- Questions must test understanding, not just memory of specific wording from the pages.
- Distractors (wrong answers) must be plausible — avoid obviously wrong options.
- Weights must sum to exactly 100 across all questions. Distribute them so harder or more important questions carry more weight.
- Every question must reference at least one revision_page_id.
- The package must have at least 3 pages.
- Do not include any explanation outside the YAML block. Return only the raw YAML.

---

OUTPUT FORMAT

Return only a raw YAML block with no markdown code fences, no commentary, and no trailing text. The YAML must be valid and parseable.
```

---

## Validation

After saving the file to `packages/`, start the backend and check the startup log. If the file fails validation, the error message will identify the specific field that is incorrect.

Common issues:
- Weights do not sum to 100
- `correct_answer` does not match any Answer `id` in that question
- `revision_page_ids` references a page `id` that does not exist
- `id` contains spaces or uppercase letters