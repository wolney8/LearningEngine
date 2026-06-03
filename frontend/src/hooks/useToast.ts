import { useCallback } from "react";
import { type ToastInput, useToastContext } from "../context/ToastContext";

type ToastPushOptions = Omit<ToastInput, "type" | "message">;

export function useToast() {
  const { toasts, pushToast, dismissToast, clearToasts } = useToastContext();

  const info = useCallback(
    (message: string, options?: ToastPushOptions) =>
      pushToast({ type: "info", message, ...options }),
    [pushToast],
  );

  const success = useCallback(
    (message: string, options?: ToastPushOptions) =>
      pushToast({ type: "success", message, ...options }),
    [pushToast],
  );

  const error = useCallback(
    (message: string, options?: ToastPushOptions) =>
      pushToast({ type: "error", message, ...options }),
    [pushToast],
  );

  return {
    toasts,
    pushToast,
    dismissToast,
    clearToasts,
    info,
    success,
    error,
  };
}
