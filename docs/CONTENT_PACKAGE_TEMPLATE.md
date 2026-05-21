# Content Package Template

## 1. Overview

A content package is a single YAML file that defines one learning module, including its pages, quiz questions, scoring rules, and metadata. Package files are stored in the `packages/` directory and are loaded by the server at runtime.

## 2. File naming

- Files must be named `<package-id>.yaml`.
- Package IDs must be lowercase, alphanumeric, and hyphen-only (for example: `intro-to-python`, `networking-basics`).

## 3. Top-level schema

| Field         | Type           | Required | Description                                        |
| ------------- | -------------- | -------- | -------------------------------------------------- |
| id            | string         | yes      | Matches file name (without `.yaml`)                |
| title         | string         | yes      | Display name shown on selection screen             |
| description   | string         | yes      | One-two sentence summary shown on selection screen |
| version       | string         | yes      | Semantic version string, for example `"1.0.0"`     |
| tags          | list[string]   | no       | Optional labels for filtering                      |
| passing_score | number         | yes      | Minimum weighted percentage to pass (0-100)        |
| pages         | list[Page]     | yes      | Ordered list of learning pages                     |
| questions     | list[Question] | yes      | Pool of test questions                             |

## 4. Page schema

| Field   | Type   | Required | Description                                                                |
| ------- | ------ | -------- | -------------------------------------------------------------------------- |
| id      | string | yes      | Unique within this package                                                 |
| title   | string | yes      | Page heading                                                               |
| content | string | yes      | Body text. Plain text only (Markdown support is an open question - OQ-001) |

## 5. Question schema

| Field             | Type         | Required | Description                                                                     |
| ----------------- | ------------ | -------- | ------------------------------------------------------------------------------- |
| id                | string       | yes      | Unique within this package                                                      |
| text              | string       | yes      | Question text shown to the user                                                 |
| answers           | list[Answer] | yes      | Between 2 and 6 answer options                                                  |
| correct_answer    | string       | yes      | Must match the `id` of one Answer                                               |
| weight            | number       | yes      | Scoring weight; all weights should sum to 100 across the package                |
| feedback          | string       | yes      | Shown after submission regardless of correctness                                |
| revision_page_ids | list[string] | no       | IDs of pages to recommend for revision if this question is answered incorrectly |

## 6. Answer schema

| Field | Type   | Required | Description                   |
| ----- | ------ | -------- | ----------------------------- |
| id    | string | yes      | Unique within this question   |
| text  | string | yes      | Answer text shown to the user |

## 7. Scoring notes

- The backend computes: `sum(question.weight for each correctly answered question) / sum(all question weights) * 100`.
- Weights do not need to sum to 100; the formula normalises. However, making them sum to 100 makes the maths obvious.
- `passing_score` is the minimum percentage needed to pass.

## 8. Full annotated example

```yaml
id: intro-to-python
title: Introduction to Python
description: Learn the core ideas behind Python syntax, variables, control flow, and functions. This package is designed for complete beginners.
version: "1.0.0"
tags: ["python", "beginner"]
passing_score: 60

pages:
  - id: py-basics
    title: Python Basics
    content: Python is a general-purpose programming language known for readable syntax. Statements are often shorter than in many other languages.

  - id: variables-and-types
    title: Variables and Types
    content: Variables store values such as numbers, text, and booleans. Python is dynamically typed, which means variable types are determined at runtime.

  - id: control-flow-and-functions
    title: Control Flow and Functions
    content: Control flow uses if statements and loops to direct execution. Functions let you group logic into reusable blocks with clear inputs and outputs.

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
    weight: 20
    feedback: Python is a high-level programming language designed to be readable and expressive.
    revision_page_ids: ["py-basics"]

  - id: q2
    text: What does dynamic typing mean in Python?
    answers:
      - id: a
        text: You must declare variable types before assignment.
      - id: b
        text: Variable types can change, and are determined at runtime.
      - id: c
        text: Types are determined only when code is compiled to machine code.
      - id: d
        text: Python supports only numeric variables.
    correct_answer: b
    weight: 20
    feedback: In Python, values carry types and names can be rebound to values of different types.
    revision_page_ids: ["variables-and-types"]

  - id: q3
    text: Which option is a valid reason to use a function?
    answers:
      - id: a
        text: To avoid all loops in a program.
      - id: b
        text: To make code run without any variables.
      - id: c
        text: To reuse logic and improve clarity.
      - id: d
        text: To replace all conditional statements automatically.
    correct_answer: c
    weight: 20
    feedback: Functions help organise code, avoid repetition, and make behaviour easier to test.
    revision_page_ids: ["control-flow-and-functions"]

  - id: q4
    text: What is the purpose of an if statement?
    answers:
      - id: a
        text: To repeat code a fixed number of times.
      - id: b
        text: To choose between code paths based on a condition.
      - id: c
        text: To import external libraries.
      - id: d
        text: To declare package metadata.
    correct_answer: b
    weight: 20
    feedback: if statements evaluate a condition and then run different code depending on whether it is true or false.

  - id: q5
    text: Which answer best describes a Python variable?
    answers:
      - id: a
        text: A fixed memory address that cannot change.
      - id: b
        text: A name that refers to a value.
      - id: c
        text: A function parameter only.
      - id: d
        text: A file that stores program output.
    correct_answer: b
    weight: 20
    feedback: A variable is a name bound to an object, such as a number or string.
    revision_page_ids: ["variables-and-types", "py-basics"]
```

## 9. Validation

Validation is enforced server-side via Pydantic. Any YAML that does not match the schema will fail to load and will be excluded from the package list.
