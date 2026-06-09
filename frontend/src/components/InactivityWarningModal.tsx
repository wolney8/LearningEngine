import { useEffect, useId, useRef } from "react";
import "./InactivityWarningModal.css";

interface InactivityWarningModalProps {
  open: boolean;
  secondsRemaining: number;
  onStaySignedIn: () => void;
  onSignOutNow: () => void;
}

export function InactivityWarningModal({
  open,
  secondsRemaining,
  onStaySignedIn,
  onSignOutNow,
}: InactivityWarningModalProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (returnFocusRef.current?.isConnected) {
        returnFocusRef.current.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const secondsLabel =
    secondsRemaining === 1 ? "1 second" : `${secondsRemaining} seconds`;

  return (
    <div className="inactivity-warning-modal" data-testid="inactivity-warning-modal">
      <div className="inactivity-warning-modal__backdrop" aria-hidden="true" />
      <dialog
        ref={dialogRef}
        className="inactivity-warning-modal__panel"
        open
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <p className="inactivity-warning-modal__eyebrow">Session check</p>
        <h2 id={headingId} className="inactivity-warning-modal__title">
          Are you still there?
        </h2>
        <p className="inactivity-warning-modal__body">
          Your session is about to end because of inactivity. Stay signed in to keep
          working, or sign out now.
        </p>
        <p className="inactivity-warning-modal__countdown" aria-live="assertive">
          Automatic sign-out in {secondsLabel}.
        </p>
        <div className="inactivity-warning-modal__actions">
          <button
            type="button"
            className="inactivity-warning-modal__button inactivity-warning-modal__button--secondary"
            onClick={onSignOutNow}
          >
            Sign out now
          </button>
          <button
            type="button"
            className="inactivity-warning-modal__button inactivity-warning-modal__button--primary"
            onClick={onStaySignedIn}
          >
            Stay signed in
          </button>
        </div>
      </dialog>
    </div>
  );
}
