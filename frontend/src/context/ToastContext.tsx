import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type ToastType = "info" | "success" | "error";

export type ToastItem = {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  durationMs: number;
};

export type ToastInput = {
  type: ToastType;
  title?: string;
  message: string;
  durationMs?: number;
};

type ToastContextValue = {
  toasts: ToastItem[];
  pushToast: (input: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

const DEFAULT_TOAST_DURATION_MS = 5000;
const ERROR_TOAST_DURATION_MS = 7000;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

function getToastDurationMs(input: ToastInput): number {
  if (input.durationMs != null) {
    return Math.max(1000, input.durationMs);
  }

  if (input.type === "error") {
    return ERROR_TOAST_DURATION_MS;
  }

  return DEFAULT_TOAST_DURATION_MS;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((previousToasts) => previousToasts.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const pushToast = useCallback((input: ToastInput) => {
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const nextToast: ToastItem = {
      id,
      type: input.type,
      title: input.title,
      message: input.message,
      durationMs: getToastDurationMs(input),
    };

    setToasts((previousToasts) => [...previousToasts, nextToast]);

    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      pushToast,
      dismissToast,
      clearToasts,
    }),
    [clearToasts, dismissToast, pushToast, toasts],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToastContext(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
