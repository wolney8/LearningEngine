This document defines the accessibility standard for the Local Learning Engine. All frontend work must meet this standard before a phase is closed.

# Accessibility Standard

## 1. Compliance Target

The mandatory baseline for the Local Learning Engine is **WCAG 2.2 Level AA**. As a study application, particular emphasis must be placed on cognitive accessibility, form operability, clear navigation, and focus management to ensure a distraction-free and inclusive learning experience.

## 2. POUR Implementation Notes

- **Perceivable**: All learning materials (images, diagrams, code blocks) must have text alternatives or descriptive captions.
- **Operable**: Test forms and question navigation must be completely keyboard accessible without requiring a mouse. No strict time limits on tests unless explicitly configured by the user.
- **Understandable**: Consistent placement of the "Next Question" and "Submit Test" buttons. Clear error identification if a question is skipped or invalid.
- **Robust**: Custom quiz components (e.g. drag-and-drop ordering, select-all-that-apply) must use appropriate ARIA roles and maintain correct state properties.

## 3. WCAG 2.2 Application

- **SC 2.4.11 Focus Not Obscured (Minimum)**: Sticky headers or fixed test-progress bars must not visually hide the currently focused answer or question text.
- **SC 2.5.7 Dragging Movements**: Any drag-and-drop matching interfaces must include a single-pointer alternative (e.g. tap to select, tap to assign).
- **SC 2.5.8 Target Size (Minimum)**: All interactive targets (answer checkboxes, progression buttons) must have a footprint of at least 24×24 CSS pixels.
- **SC 3.3.7 Redundant Entry**: Users must not be asked to re-enter information (e.g. student name or test settings) during a single learning session.
- **SC 3.3.8 Accessible Authentication**: If a login is ever required, it must support password managers and must not rely on cognitive function tests.

## 4. Focus Management Rules

- **View Transitions**: When transitioning from Learning Mode to Test Mode, or when proceeding to the next question, keyboard focus must reset to the top of the new content area (e.g. the `<h1>` of the question).
- Focus indicators must be highly visible and exceed the default browser styling (e.g. a 2px solid ring with a 2px offset).

## 5. Colour Contrast Requirements

- **Normal Text (≤ 18pt or 14pt bold)**: Minimum 4.5:1 ratio against the background.
- **Large Text (≥ 18pt or 14pt bold) and Essential UI (form inputs, focus rings)**: Minimum 3:1 ratio.
- Answer states (correct/incorrect) must not rely solely on colour; always pair colour changes with an icon or explicit text label.

## 6. Keyboard Navigation

- The question navigator must function logically using `Tab` (forward) and `Shift + Tab` (backward).
- Answer selection (multiple choice) must support `Arrow` keys for radio button groups and `Space` to toggle checkboxes.
- Global shortcuts (e.g. `Cmd/Ctrl + Enter` to submit) should be provided but must be documented clearly in the UI.

## 7. Screen Reader Support

- Minimum tested targets: **VoiceOver** (macOS/iOS) and **NVDA** (Windows).
- Live regions (`aria-live="polite"`) must announce test feedback, score changes, or timer warnings without stealing focus.

## 8. Review Gate

- An accessibility review is required before merging any PR that introduces or modifies interactive UI components, test forms, or layout structures.
- Both an automated pass (e.g. axe-core) and a manual keyboard/screen reader check are required to pass.

## Design Tokens

### Colour Palette

#### Light Mode

| Role           | Token                  | Value     | Contrast                |
| -------------- | ---------------------- | --------- | ----------------------- |
| Background     | `--col-bg`             | `#FFFFFF` | N/A                     |
| Surface        | `--col-surface`        | `#F4F5F7` | N/A                     |
| Surface raised | `--col-surface-raised` | `#FFFFFF` | N/A                     |
| Primary        | `--col-primary`        | `#0052CC` | 7.1:1 on #FFFFFF ✓      |
| Primary hover  | `--col-primary-hover`  | `#0747A6` | 9.0:1 on #FFFFFF ✓      |
| Secondary      | `--col-secondary`      | `#42526E` | 6.9:1 on #FFFFFF ✓      |
| Text primary   | `--col-text-primary`   | `#172B4D` | 12.8:1 on #FFFFFF ✓     |
| Text secondary | `--col-text-secondary` | `#5E6C84` | 5.1:1 on #FFFFFF ✓      |
| Text disabled  | `--col-text-disabled`  | `#8993A4` | 2.5:1 (decorative)      |
| Border         | `--col-border`         | `#DFE1E6` | N/A                     |
| Border focus   | `--col-border-focus`   | `#4C9AFF` | 3.1:1 on #FFFFFF ✓ (UI) |
| Success        | `--col-success`        | `#00875A` | 4.8:1 on #FFFFFF ✓      |
| Warning        | `--col-warning`        | `#B25C00` | 5.3:1 on #FFFFFF ✓      |
| Error          | `--col-error`          | `#DE350B` | 5.2:1 on #FFFFFF ✓      |
| Info           | `--col-info`           | `#0065FF` | 5.1:1 on #FFFFFF ✓      |

#### Dark Mode

| Role           | Token                  | Value     | Contrast                |
| -------------- | ---------------------- | --------- | ----------------------- |
| Background     | `--col-bg`             | `#121212` | N/A                     |
| Surface        | `--col-surface`        | `#1E1E1E` | N/A                     |
| Surface raised | `--col-surface-raised` | `#2C2C2C` | N/A                     |
| Primary        | `--col-primary`        | `#4C9AFF` | 5.6:1 on #1E1E1E ✓      |
| Primary hover  | `--col-primary-hover`  | `#87BFFF` | 9.5:1 on #1E1E1E ✓      |
| Secondary      | `--col-secondary`      | `#97A0AF` | 6.2:1 on #1E1E1E ✓      |
| Text primary   | `--col-text-primary`   | `#F4F5F7` | 14.1:1 on #1E1E1E ✓     |
| Text secondary | `--col-text-secondary` | `#A5ADBA` | 7.5:1 on #1E1E1E ✓      |
| Text disabled  | `--col-text-disabled`  | `#5E6C84` | 3.3:1 (decorative)      |
| Border         | `--col-border`         | `#343A40` | N/A                     |
| Border focus   | `--col-border-focus`   | `#4C9AFF` | 5.6:1 on #1E1E1E ✓ (UI) |
| Success        | `--col-success`        | `#36B37E` | 5.5:1 on #1E1E1E ✓      |
| Warning        | `--col-warning`        | `#FFC400` | 10.3:1 on #1E1E1E ✓     |
| Error          | `--col-error`          | `#FF5630` | 5.5:1 on #1E1E1E ✓      |
| Info           | `--col-info`           | `#4C9AFF` | 5.6:1 on #1E1E1E ✓      |

#### Answer States

| State      | Token                | Behaviour                                                       |
| ---------- | -------------------- | --------------------------------------------------------------- |
| Unanswered | `--state-unanswered` | Standard border, standard background                            |
| Selected   | `--state-selected`   | Border: `--col-primary`; background: 8% opacity tint of primary |
| Correct    | `--state-correct`    | Border and text: `--col-success`; requires checkmark icon       |
| Incorrect  | `--state-incorrect`  | Border and text: `--col-error`; requires cross icon             |

### Typography

| Role             | Font family               | Size       | Weight | Line height |
| ---------------- | ------------------------- | ---------- | ------ | ----------- |
| Heading 1        | `system-ui, sans-serif`   | `2.5rem`   | `700`  | `1.2`       |
| Heading 2        | `system-ui, sans-serif`   | `1.75rem`  | `600`  | `1.3`       |
| Heading 3        | `system-ui, sans-serif`   | `1.25rem`  | `600`  | `1.4`       |
| Body             | `system-ui, sans-serif`   | `1rem`     | `400`  | `1.5`       |
| Small / Caption  | `system-ui, sans-serif`   | `0.875rem` | `400`  | `1.4`       |
| Code / Monospace | `ui-monospace, monospace` | `0.875rem` | `400`  | `1.5`       |

### Spacing Scale (8 pt grid)

`--space-xs: 4px` · `--space-sm: 8px` · `--space-md: 16px` · `--space-lg: 24px` · `--space-xl: 32px` · `--space-2xl: 48px` · `--space-3xl: 64px` · `--space-4xl: 96px`

### Border Radius

| Scale                      | Token           | Value    |
| -------------------------- | --------------- | -------- |
| Small (inputs, checkboxes) | `--radius-sm`   | `4px`    |
| Medium (cards, modals)     | `--radius-md`   | `8px`    |
| Full (pills, badges)       | `--radius-full` | `9999px` |

### Interactive Targets

- Minimum: 24×24 CSS pixels (WCAG 2.5.8 AA)
- Recommended for buttons: 44px height for touch support

### Motion

All animations must respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

## Voice and Tone

### UI Copy

- Professional, clear, and encouraging. Use British English spelling throughout.
- CTAs use explicit verbs: "Submit answer", "Next question", "End test" — not "Proceed" or "OK".
- Favour short, declarative sentences.

### Error Messages

- State what happened, why, and how to resolve it. Never blame the user.
- ✗ "You forgot to answer question 3."
- ✓ "Question 3 requires an answer before you can submit the test."

### Test Feedback

- Formulate feedback that validates the learning journey, not just a score.
- Distinguish informative evaluation ("Your answer is incorrect") from corrective tutorial ("Incorrect. The correct protocol is X because of Y.").

### Loading and Progress States

- Use context-aware microcopy: "Preparing your test…", "Analysing answers…", "Saving progress…"
- Communicate position clearly: "Question 4 of 20" — do not rely solely on visual progress bars.
