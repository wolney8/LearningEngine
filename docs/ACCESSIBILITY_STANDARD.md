This document defines the accessibility standard for the Local Learning Engine. All frontend work should meet this standard before review is treated as complete.

# Accessibility Standard

## 1. Compliance Target

The mandatory baseline for the Local Learning Engine is **WCAG 2.2 Level AA**. As a study application, particular emphasis should be placed on cognitive accessibility, form operability, clear navigation, and focus management.

## 2. POUR Implementation Notes

- **Perceivable**: Learning materials such as images, diagrams, and code blocks should have text alternatives or descriptive captions.
- **Operable**: Lesson and test flows should be keyboard accessible without requiring a mouse.
- **Understandable**: Navigation, state changes, and errors should be clear and consistent.
- **Robust**: Custom interactive components should use appropriate semantics and maintain correct state.

## 3. WCAG 2.2 Application

- **SC 2.4.11 Focus Not Obscured (Minimum)**: Sticky headers or fixed progress UI must not hide the currently focused content.
- **SC 2.5.7 Dragging Movements**: Any drag-and-drop interaction should include a single-pointer alternative.
- **SC 2.5.8 Target Size (Minimum)**: Interactive targets should be at least 24×24 CSS pixels.
- **SC 3.3.7 Redundant Entry**: Users should not have to re-enter information unnecessarily during a flow.
- **SC 3.3.8 Accessible Authentication**: Authentication should support password managers and avoid cognitive challenge patterns.

## 4. Focus Management Rules

- When changing views or major content regions, focus should move predictably to the new primary content.
- Focus indicators should be clearly visible.

## 5. Colour Contrast Requirements

- **Normal text**: minimum 4.5:1 contrast ratio
- **Large text and essential UI**: minimum 3:1 contrast ratio
- Correct and incorrect states must not rely only on colour

## 6. Keyboard Navigation

- Primary actions should be reachable and operable with the keyboard.
- Question and answer interactions should remain navigable without pointer-only behaviour.
- Keyboard shortcuts, if present, should be documented in the UI.

## 7. Screen Reader Support

- Minimum intended targets: **VoiceOver** and **NVDA**
- Live regions should announce important state changes without stealing focus

## 8. Review Expectations

- Any change that affects interactive UI, navigation, or layout should receive an accessibility review.
- Automated checks such as axe-core help, but they do not replace manual keyboard review.

## Design Tokens

The legacy token tables below remain useful as a reference set. Treat them as guidance unless superseded by active frontend styles or newer design-token work.

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

### Typography

| Role             | Font family               | Size       | Weight | Line height |
| ---------------- | ------------------------- | ---------- | ------ | ----------- |
| Heading 1        | `system-ui, sans-serif`   | `2.5rem`   | `700`  | `1.2`       |
| Heading 2        | `system-ui, sans-serif`   | `1.75rem`  | `600`  | `1.3`       |
| Heading 3        | `system-ui, sans-serif`   | `1.25rem`  | `600`  | `1.4`       |
| Body             | `system-ui, sans-serif`   | `1rem`     | `400`  | `1.5`       |
| Small / Caption  | `system-ui, sans-serif`   | `0.875rem` | `400`  | `1.4`       |
| Code / Monospace | `ui-monospace, monospace` | `0.875rem` | `400`  | `1.5`       |

### Motion

All animations should respect `prefers-reduced-motion`.

## Voice and Tone

- Use British English.
- Keep action labels explicit.
- Error messages should say what happened and what the user can do next.
