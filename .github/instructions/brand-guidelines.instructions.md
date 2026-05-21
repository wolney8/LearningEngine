---
description: "Use when designing or reviewing any UI component, marketing material, or user-facing content. Defines brand colours, typography, logo usage, spacing, and voice and tone. Customise this file for your organisation before using the Designer agent."
---

# Brand Guidelines

> **Local Learning Engine Design System**
> This document specifies the complete visual language for the Gamified Local Learning Engine. All parameters must be strictly adhered to and evaluated for WCAG 2.2 AA compliance.

---

## Colours

| Role             | CSS token                 | Light mode    | Dark mode  |
| ---------------- | ------------------------- | ------------- | ---------- |
| Primary          | `--colour-primary`        | `#4F46E5`     | `#6366F1`  |
| Primary hover    | `--colour-primary-hover`  | `#4338CA`     | `#818CF8`  |
| Secondary        | `--colour-secondary`      | `#64748B`     | `#94A3B8`  |
| Accent           | `--colour-accent`         | `#8B5CF6`     | `#A78BFA`  |
| Background       | `--colour-background`     | `#FFFFFF`     | `#0F172A`  |
| Surface          | `--colour-surface`        | `#F4F5F7`     | `#1E293B`  |
| Text — primary   | `--colour-text-primary`   | `#0F172A`     | `#F8FAFC`  |
| Text — secondary | `--colour-text-secondary` | `#475569`     | `#94A3B8`  |
| Border           | `--colour-border`         | `#E2E8F0`     | `#334155`  |
| Error            | `--colour-error`          | `#DC2626`     | `#EF4444`  |
| Success          | `--colour-success`        | `#16A34A`     | `#22C55E`  |
| Warning          | `--colour-warning`        | `#D97706`     | `#F59E0B`  |

Contrast notes (light mode, normal text on white):
- `--colour-text-primary` `#0F172A`: **15.8:1** ✓
- `--colour-text-secondary` `#475569`: **7.0:1** ✓
- `--colour-primary` `#4F46E5` on white (button label): **5.7:1** ✓
- `--colour-secondary` `#64748B` on white: **4.7:1** ✓

All text/background colour pairs must meet WCAG 2.2 AA (4.5:1 normal text, 3:1 large text and UI components). Verify using the `#ui-inspect` skill.

---

## Gamification Colours

| Role                  | CSS token               | Light mode | Dark mode  |
| --------------------- | ----------------------- | ---------- | ---------- |
| Correct state         | `--colour-correct`      | `#15803D`  | `#22C55E`  |
| Incorrect state       | `--colour-incorrect`    | `#DC2626`  | `#F87171`  |
| Streak / flame accent | `--colour-streak`       | `#F97316`  | `#FB923C`  |
| XP bar fill           | `--colour-xp`           | `#0284C7`  | `#38BDF8`  |
| XP bar track          | `--colour-xp-track`     | `#E0F2FE`  | `#0F2942`  |
| Gold grade            | `--colour-grade-gold`   | `#EAB308`  | `#FDE047`  |
| Silver grade          | `--colour-grade-silver` | `#94A3B8`  | `#CBD5E1`  |
| Bronze grade          | `--colour-grade-bronze` | `#B45309`  | `#D97706`  |

Critical rule: colour alone must NEVER be the sole indicator of correct/incorrect state. Always pair with a `CheckCircle` / `XCircle` icon and textual feedback (WCAG 1.4.1).

---

## Typography

| Role             | Font family      | Size       | Weight | Line height |
| ---------------- | ---------------- | ---------- | ------ | ----------- |
| Heading 1        | `Nunito`         | `2rem`     | `800`  | `1.2`       |
| Heading 2        | `Nunito`         | `1.5rem`   | `700`  | `1.3`       |
| Heading 3        | `Nunito`         | `1.25rem`  | `700`  | `1.4`       |
| Body             | `Inter`          | `1rem`     | `400`  | `1.6`       |
| Small / caption  | `Inter`          | `0.875rem` | `600`  | `1.2`       |
| UI buttons       | `Nunito`         | `1.125rem` | `700`  | `1`         |
| Code / monospace | `JetBrains Mono` | `0.875rem` | `400`  | `1.5`       |

Fonts loaded via Google Fonts. Fallback stacks:
- Nunito: `'Nunito', 'Segoe UI', sans-serif`
- Inter: `'Inter', system-ui, sans-serif`
- JetBrains Mono: `'JetBrains Mono', 'Fira Code', monospace`

Minimum interactive target size: **44×44 CSS px** on touch (WCAG 2.5.8 AA). Absolute minimum: **24×24 CSS px**.

---

## Logo

| Usage                           | Asset path                       |
| ------------------------------- | -------------------------------- |
| Primary logo — light background | `/assets/logo/logo-dark.svg`     |
| Primary logo — dark background  | `/assets/logo/logo-light.svg`    |
| Icon / favicon                  | `/assets/logo/icon.svg`          |

Logo rules:
- Minimum display width 120 px; always maintain aspect ratio.
- Clear space equal to the cap-height of the wordmark on all sides.
- Never place the logo on a background with less than 3:1 contrast ratio.

---

## Spacing Scale

8pt grid: `4px` · `8px` · `12px` · `16px` · `24px` · `32px` · `48px` · `64px` · `96px`

**Border radii:**

| Token          | Value    | Usage                                    |
| -------------- | -------- | ---------------------------------------- |
| `--radius-sm`  | `8px`    | Progress bars, inner elements            |
| `--radius-md`  | `12px`   | Inputs, small cards                      |
| `--radius-lg`  | `16px`   | Package cards, lesson blocks, dialogs    |
| `--radius-pill`| `9999px` | Primary buttons, streak badges, tags     |

---

## Animation Tokens

| Token               | Value                                     | Usage                                    |
| ------------------- | ----------------------------------------- | ---------------------------------------- |
| `--duration-fast`   | `150ms`                                   | Hover states, correct flash              |
| `--duration-normal` | `300ms`                                   | Screen transitions, card slides          |
| `--duration-slow`   | `600ms`                                   | Celebrations, score wheel, XP counter    |
| `--easing-smooth`   | `ease-in-out`                             | Page transitions, fades                  |
| `--easing-bounce`   | `cubic-bezier(0.34, 1.56, 0.64, 1)`       | Badge pop-in, XP bar fill                |
| `--easing-spring`   | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Correct/incorrect card feedback          |

**WCAG `prefers-reduced-motion` rule (mandatory):**
All decorative animations (confetti, bounce, shake, scale transforms) MUST be suppressed or replaced with a simple `opacity` fade when `@media (prefers-reduced-motion: reduce)` is active. This applies globally — no exceptions.

**Gamification animation behaviours:**

| Moment                      | Behaviour                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Correct answer (Practice)   | Button flashes `--colour-correct`, bounces to 1.05× then back; feedback banner slides up       |
| Incorrect answer (Practice) | Selected button flashes `--colour-incorrect`; card shakes ±4px horizontally (2 cycles); correct answer highlighted green simultaneously |
| Streak ×2                   | `Zap` badge pulses, scales 1.2× then settles with `--easing-bounce`                            |
| Streak ×3                   | `Flame` badge replaces `Zap`; same pop animation; `--colour-streak` glow around badge          |
| Streak ×5+                  | Local confetti burst around badge; "You're on fire!" toast; `--duration-slow`                   |
| Streak broken               | Badge fades to grey with slow `opacity` transition; no jarring drop animation                  |
| Perfect round               | Full-screen confetti overlay; score screen slides in with staggered XP counter                 |
| XP bar fill                 | Smooth width transition with `--easing-smooth` over `--duration-slow`; numeric counter ticks   |
| Lesson page complete        | Soft fade-out of content; completion card fades in                                             |
| Exam score wheel reveal     | Circular progress fills to score over `--duration-slow`; numeric % counts up                   |
| Test complete — pass        | Gold/silver trophy slides in with rhythmic bounce; confetti; encouraging message               |
| Test complete — fail        | Calm bronze/silver tone; no alarming animation; "Try again" CTA prominent                      |

---

## Iconography

**Library: Lucide React** (tree-shakeable, accessible SVG, consistent stroke weight)

| State / Action       | Lucide icon       |
| -------------------- | ----------------- |
| Correct answer       | `CheckCircle`     |
| Incorrect answer     | `XCircle`         |
| Streak ×2            | `Zap`             |
| Streak ×3+           | `Flame`           |
| XP / points          | `Star`            |
| Locked content       | `LockKeyhole`     |
| Lesson progress      | `Map`             |
| Chapter complete     | `CircleCheck`     |
| Mute                 | `VolumeX`         |
| Unmute               | `Volume2`         |
| Dark mode            | `Moon`            |
| Light mode           | `Sun`             |

All icon-only buttons MUST have an `aria-label`. Icons used alongside text are decorative (`aria-hidden="true"`).

---

## Gamification Component Visual Language

### Package card
Chunky card (`--radius-lg`), 2px solid `--colour-border`. On hover: lifts 4px, hard drop shadow `4px 4px 0 var(--colour-primary)`. Tactile, stackable feel. 44px minimum touch height.

### Question card
Generously padded (24px+). Question text uses H2/H3. No border; sits on `--colour-surface`. Full width on mobile.

### Answer button (4 states)
- **Default**: `--colour-surface` bg, bold Nunito label, 2px bottom border to appear pressable.
- **Hover**: Slight brightness boost, primary border outline.
- **Selected**: Translates down 2px (depressed), loses bottom border, `--colour-primary` outline.
- **Correct**: `--colour-correct` bg, white text, `CheckCircle` icon left-aligned.
- **Incorrect**: `--colour-incorrect` bg, white text, `XCircle` icon left-aligned. Correct answer simultaneously highlighted in `--colour-correct`.

### Progress bar (lesson + XP variants)
Thick track (`--colour-xp-track`), `--radius-pill`. Fill uses `--colour-xp` with a rounded cap. Lesson bar is thinner (8px); XP bar is thicker (16px).

### Streak badge
Floating sticky pill. `--colour-streak` background, white Nunito bold counter, `Zap`/`Flame` icon. `aria-label="Current streak: X correct in a row"`. Bounces on update.

### Countdown timer
Large monospace digits (`JetBrains Mono`, H1 size). Colour transitions: `--colour-text-primary` → `--colour-warning` (at 30s) → `--colour-error` (at 10s). `aria-live="polite"` region announces "30 seconds remaining" and "10 seconds remaining". `aria-label` on the container: "Time remaining".

### Difficulty selector
4-button segmented control, graded in colour intensity left to right:
- Easy: `#22C55E` (green)
- Normal: `#3B82F6` (blue)
- Hard: `#F97316` (orange)
- Expert: `#DC2626` (red)

Selected state shows a pressed/filled background. Unselected is outlined. Full keyboard navigable, `role="radiogroup"` with `role="radio"` children.

### Results screen
Circular score wheel dominates top third. Cascades to XP earned (with counter animation), streak held, personal best comparison. Large pill "Continue" CTA at bottom.

---

## Voice and Tone

| Dimension          | Guideline                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Formality          | Casual, encouraging, upbeat. Avoid academic or punishing language.                             |
| Perspective        | Second person ("you", "your journey") in all UI copy.                                          |
| Sentence length    | ≤ 10–15 words for game-state micro-copy. Brief and punchy.                                     |
| Correct feedback   | Vary between: "Brilliant!", "Spot on!", "Exactly right!" (rotation prevents fatigue)           |
| Incorrect feedback | "Not quite — the answer was [X]. You'll get it next time!" Never shame.                        |
| Streak ×2          | "Looking good!"                                                                                |
| Streak ×3          | "Generating momentum!"                                                                         |
| Streak ×5+         | "You're on fire! Unstoppable!"                                                                 |
| Streak broken      | Streak badge quietly resets. No negative message.                                              |
| Perfect round      | "Flawless round! 🎉"                                                                           |
| Test pass          | "Outstanding! You've mastered this topic."                                                     |
| Test fail          | "So close! Review the lesson and jump back in. You've got this."                               |
| Empty state        | "Your learning journey starts here. Pick a topic to begin."                                    |
| Lesson start       | "Let's dive in!"                                                                               |
| Ready-to-test gate | "Ready to test your knowledge?"                                                                |

---

## Design System Reference

| Resource              | Location                                          |
| --------------------- | ------------------------------------------------- |
| Icon library          | [Lucide Icons](https://lucide.dev)                |
| Design token file     | `frontend/src/styles/tokens.css`                  |
| Google Fonts          | Nunito, Inter, JetBrains Mono                     |
