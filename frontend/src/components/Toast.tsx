import { useEffect } from "react";
import type { ToastItem } from "../context/ToastContext";
import "./Toast.css";

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

interface ToastCardProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ toast, onDismiss }: ToastCardProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss(toast.id);
    }, toast.durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [onDismiss, toast.durationMs, toast.id]);

  const isError = toast.type === "error";

  return (
    <li
      className={`toast toast--${toast.type}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      data-testid={`toast-${toast.type}`}
    >
      <div className="toast__content">
        {toast.title ? <p className="toast__title">{toast.title}</p> : null}
        <p className="toast__message">{toast.message}</p>
      </div>
      <button
        type="button"
        className="toast__dismiss"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        Dismiss
      </button>
    </li>
  );
}

export function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <section className="toast-region" aria-label="Notifications">
      <ol className="toast-region__list">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </ol>
    </section>
  );
}
