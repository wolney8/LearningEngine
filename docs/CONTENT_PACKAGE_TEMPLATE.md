# Content Package Template

## 1. Overview

A content package is a single YAML file that defines one learning module, including lesson pages, quiz questions, scoring rules, and metadata. Package files are stored in `packages/` and loaded by the backend at runtime.

## 2. File naming

- Files should be named `<package-id>.yaml`.
- Package IDs must be lowercase, alphanumeric, and hyphen-only.

## 3. Top-level schema

| Field         | Type           | Required | Description |
| ------------- | -------------- | -------- | ----------- |
| id            | string         | yes      | Matches file name without `.yaml` |
| title         | string         | yes      | Display name |
| description   | string         | yes      | Summary shown in package lists |
| version       | string         | yes      | Semantic version string, for example `"1.0.0"` |
| tags          | list[string]   | no       | Optional labels for filtering |
| passing_score | number         | yes      | Pass threshold from `0.0` to `1.0` |
| pages         | list[Page]     | yes      | Ordered lesson pages |
| questions     | list[Question] | yes      | Test question pool |

## 4. Page schema

| Field   | Type   | Required | Description |
| ------- | ------ | -------- | ----------- |
| id      | string | yes      | Unique within the package |
| title   | string | yes      | Page heading |
| content | string | yes      | Markdown content rendered in the frontend |

## 5. Question schema

| Field             | Type         | Required | Description |
| ----------------- | ------------ | -------- | ----------- |
| id                | string       | yes      | Unique within the package |
| difficulty        | string       | no       | Optional, but if used every question should be tagged as `easy`, `normal`, `hard`, or `expert` |
| text              | string       | yes      | Question prompt |
| answers           | list[Answer] | yes      | Between 2 and 6 answers |
| correct_answer    | string       | yes      | Must match one answer `id` |
| weight            | number       | yes      | Positive weight |
| feedback          | string       | yes      | Explanation shown after answering |
| revision_page_ids | list[string] | no       | Page ids recommended for revision |

## 6. Answer schema

| Field | Type   | Required | Description |
| ----- | ------ | -------- | ----------- |
| id    | string | yes      | Unique within the question |
| text  | string | yes      | Answer text |

## 7. Validation notes

- `correct_answer` must match one of the answer ids.
- `revision_page_ids` must refer to existing page ids.
- If question difficulty tags are used, all questions should be tagged.
- If difficulty tags are used, weights must sum to `100` within each difficulty group.
- If difficulty tags are not used, all question weights must sum to `100` across the package.

## 8. Full annotated example

```yaml
id: intro-to-python
title: Introduction to Python
description: Learn core Python ideas such as syntax, variables, control flow, and functions.
version: "1.0.0"
tags: ["python", "beginner"]
passing_score: 0.6

pages:
  - id: py-basics
    title: Python Basics
    content: |
      # Python Basics

      Python is a general-purpose programming language known for readable syntax.

  - id: variables-and-types
    title: Variables and Types
    content: |
      ## Variables and Types

      Variables store values such as numbers, text, and booleans.

questions:
  - id: q1
    text: Which statement best describes Python?
    answers:
      - id: a
        text: A markup language used for webpage styling.
      - id: b
        text: A programming language focused on readability.
      - id: c
        text: A database engine for storing documents.
      - id: d
        text: A hardware description language.
    correct_answer: b
    weight: 100
    feedback: Python is a high-level programming language designed to be readable and expressive.
    revision_page_ids: ["py-basics"]
```

## 9. Notes

- The frontend renders page content as Markdown.
- To confirm: whether all manually created packages should now use difficulty tagging by default.
