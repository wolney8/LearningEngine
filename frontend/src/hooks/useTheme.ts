import { useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "lle_theme_mode";
const SYSTEM_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(SYSTEM_THEME_MEDIA_QUERY).matches;
}

function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage read failures and fall back to system mode.
  }

  return "system";
}

export function applyThemeToDocument(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const prefersDark = getSystemPrefersDark();
  const resolvedTheme: ResolvedTheme =
    themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;

  document.documentElement.dataset.themeMode = themeMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function readInitialThemeMode(): ThemeMode {
  return readStoredThemeMode();
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [prefersDark, setPrefersDark] = useState<boolean>(() => getSystemPrefersDark());

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (mode === "system") {
      return prefersDark ? "dark" : "light";
    }
    return mode;
  }, [mode, prefersDark]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches);
    };

    setPrefersDark(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (mode === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
        return;
      }

      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage write failures; runtime theme still updates.
    }
  }, [mode]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [mode, resolvedTheme]);

  return {
    mode,
    resolvedTheme,
    setMode,
  };
}
