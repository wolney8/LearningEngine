import { useEffect, useId, useRef } from "react";
import "./SpendConfirmModal.css";

interface SpendConfirmModalProps {
  open: boolean;
  actionLabel: string;
  cost: number;
  currentXP: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0,
  );
}

export function SpendConfirmModal({
  open,
  actionLabel,
  cost,
  currentXP,
  onConfirm,
  onCancel,
  loading,
  error,
}: SpendConfirmModalProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const projectedXP = currentXP - cost;
  const hasInsufficientXP = currentXP < cost;
  const confirmDisabled = hasInsufficientXP || loading;

  useEffect(() => {
    if (!open) {
      return;
    }

    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const firstFocusable = getFocusableElements(dialogRef.current)[0];
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (event.shiftKey) {
        if (!activeElement || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const returnTarget = lastFocusedElementRef.current;
      if (returnTarget?.isConnected) {
        returnTarget.focus();
      }
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="spend-confirm-modal" data-testid="spend-confirm-modal">
      <div
        className="spend-confirm-modal__backdrop"
        aria-hidden="true"
        onKeyDown={() => {}}
        onClick={onCancel}
      />

      <dialog
        ref={dialogRef}
        className="spend-confirm-modal__panel"
        open
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <h2 id={headingId} className="spend-confirm-modal__title">
          {actionLabel}
        </h2>

        <dl className="spend-confirm-modal__stats" aria-label="XP spend summary">
          <div className="spend-confirm-modal__row">
            <dt>Cost</dt>
            <dd>
              <span className="spend-confirm-modal__xp-icon" aria-hidden="true">
                ⚡
              </span>{" "}
              {cost} XP
            </dd>
          </div>
          <div className="spend-confirm-modal__row">
            <dt>Current balance</dt>
            <dd>{currentXP} XP</dd>
          </div>
          <div className="spend-confirm-modal__row spend-confirm-modal__row--projected">
            <dt>Projected balance</dt>
            <dd>{projectedXP} XP</dd>
          </div>
        </dl>

        {hasInsufficientXP && (
          <p className="spend-confirm-modal__insufficient">Insufficient XP</p>
        )}

        {error !== null && (
          <p className="spend-confirm-modal__error" role="alert">
            {error}
          </p>
        )}

        <div className="spend-confirm-modal__actions">
          <button
            type="button"
            className="spend-confirm-modal__btn spend-confirm-modal__btn--secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="spend-confirm-modal__btn spend-confirm-modal__btn--primary"
            onClick={onConfirm}
            disabled={confirmDisabled}
            aria-disabled={confirmDisabled ? "true" : "false"}
          >
            {loading ? (
              <span className="spend-confirm-modal__loading">
                <span className="spend-confirm-modal__spinner" aria-hidden="true" />
                Confirming...
              </span>
            ) : (
              "Confirm"
            )}
          </button>
        </div>
      </dialog>
    </div>
  );
}

export type { SpendConfirmModalProps };
