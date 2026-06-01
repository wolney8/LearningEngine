import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCelebrationEffects } from "../hooks/useCelebrationEffects";
import type { ResolvedTheme } from "../hooks/useTheme";
import type { LevelProgress } from "../utils/levelProgress";
import { XPWidget } from "./XPWidget";
import "./AppTopBar.css";

interface AppTopBarProps {
  xp: number;
  levelProgress: LevelProgress;
  resolvedTheme: ResolvedTheme;
  onThemeModeChange: (mode: ResolvedTheme) => void;
}

export function AppTopBar({
  xp,
  levelProgress,
  resolvedTheme,
  onThemeModeChange,
}: AppTopBarProps) {
  const { status, user, logout, bonusXPNotice, dismissBonusXPNotice } = useAuth();
  const { triggerConfetti } = useCelebrationEffects();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const seenBonusNoticeRef = useRef<string | null>(null);
  const isAuthenticated = status === "authenticated" && Boolean(user);
  const nextTheme: ResolvedTheme = resolvedTheme === "dark" ? "light" : "dark";
  const themeToggleLabel =
    nextTheme === "dark" ? "Switch to dark theme" : "Switch to light theme";
  const themeToggleText = nextTheme === "dark" ? "Use dark" : "Use light";

  useEffect(() => {
    if (!bonusXPNotice) {
      return;
    }

    const noticeKey = `${bonusXPNotice.reason}:${bonusXPNotice.xp}`;
    if (seenBonusNoticeRef.current === noticeKey) {
      return;
    }

    seenBonusNoticeRef.current = noticeKey;
    triggerConfetti("bonus");
  }, [bonusXPNotice, triggerConfetti]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!mobileMenuContainerRef.current?.contains(target)) {
        setMobileMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="app-top-bar" data-testid="app-top-bar">
      <div className="app-top-bar__inner">
        <Link to="/" className="app-top-bar__brand" aria-label="Go to home">
          Local Learning Engine
        </Link>

        <div className="app-top-bar__right-cluster">
          <XPWidget xp={xp} levelProgress={levelProgress} compact />
          <button
            type="button"
            className="app-top-bar__theme-toggle app-top-bar__theme-toggle--desktop"
            aria-label={themeToggleLabel}
            title={themeToggleLabel}
            onClick={() => onThemeModeChange(nextTheme)}
            data-theme-current={resolvedTheme}
          >
            <span className="app-top-bar__theme-indicator" aria-hidden="true">
              {resolvedTheme === "dark" ? "◐" : "◑"}
            </span>
            <span className="app-top-bar__theme-toggle-text">{themeToggleText}</span>
          </button>

          {isAuthenticated && user ? (
            <>
              <div className="app-top-bar__auth app-top-bar__auth--desktop">
                <span className="app-top-bar__profile">{user.username}</span>
                {user.role === "admin" && (
                  <Link to="/admin/users" className="app-top-bar__profile-link">
                    Admin panel
                  </Link>
                )}
                {user.role === "admin" && (
                  <Link to="/" className="app-top-bar__profile-link">
                    Learner view
                  </Link>
                )}
                <Link to="/profile" className="app-top-bar__profile-link">
                  Profile
                </Link>
                <button
                  type="button"
                  className="app-top-bar__sign-out"
                  onClick={logout}
                >
                  Sign out
                </button>
              </div>

              <div
                className="app-top-bar__auth app-top-bar__auth--mobile"
                ref={mobileMenuContainerRef}
              >
                <button
                  type="button"
                  className="app-top-bar__menu-toggle"
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="app-top-bar-mobile-menu"
                  onClick={() => setMobileMenuOpen((value) => !value)}
                >
                  Account
                </button>
                {isMobileMenuOpen && (
                  <div id="app-top-bar-mobile-menu" className="app-top-bar__menu">
                    <button
                      type="button"
                      className="app-top-bar__theme-toggle app-top-bar__theme-toggle--mobile-menu"
                      aria-label={themeToggleLabel}
                      title={themeToggleLabel}
                      onClick={() => onThemeModeChange(nextTheme)}
                      data-theme-current={resolvedTheme}
                    >
                      <span className="app-top-bar__theme-indicator" aria-hidden="true">
                        {resolvedTheme === "dark" ? "◐" : "◑"}
                      </span>
                      <span className="app-top-bar__theme-toggle-text">
                        {themeToggleText}
                      </span>
                    </button>
                    <p className="app-top-bar__menu-profile">{user.username}</p>
                    {user.role === "admin" && (
                      <Link
                        to="/admin/users"
                        className="app-top-bar__menu-link"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Admin panel
                      </Link>
                    )}
                    {user.role === "admin" && (
                      <Link
                        to="/"
                        className="app-top-bar__menu-link"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Learner view
                      </Link>
                    )}
                    <Link
                      to="/profile"
                      className="app-top-bar__menu-link"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <button
                      type="button"
                      className="app-top-bar__menu-link"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        logout();
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                className="app-top-bar__auth app-top-bar__auth--desktop"
                data-testid="top-bar-auth-cta"
              >
                <Link to="/register" className="app-top-bar__create-account">
                  Create account
                </Link>
                <Link to="/login" className="app-top-bar__sign-in-text">
                  Sign in
                </Link>
              </div>

              <div
                className="app-top-bar__auth app-top-bar__auth--mobile"
                ref={mobileMenuContainerRef}
              >
                <button
                  type="button"
                  className="app-top-bar__menu-toggle"
                  aria-expanded={isMobileMenuOpen}
                  aria-controls="app-top-bar-mobile-menu"
                  onClick={() => setMobileMenuOpen((value) => !value)}
                >
                  Account
                </button>
                {isMobileMenuOpen && (
                  <div id="app-top-bar-mobile-menu" className="app-top-bar__menu">
                    <button
                      type="button"
                      className="app-top-bar__theme-toggle app-top-bar__theme-toggle--mobile-menu"
                      aria-label={themeToggleLabel}
                      title={themeToggleLabel}
                      onClick={() => onThemeModeChange(nextTheme)}
                      data-theme-current={resolvedTheme}
                    >
                      <span className="app-top-bar__theme-indicator" aria-hidden="true">
                        {resolvedTheme === "dark" ? "◐" : "◑"}
                      </span>
                      <span className="app-top-bar__theme-toggle-text">
                        {themeToggleText}
                      </span>
                    </button>
                    <Link
                      to="/register"
                      className="app-top-bar__menu-link"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Create account
                    </Link>
                    <Link
                      to="/login"
                      className="app-top-bar__menu-link"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {bonusXPNotice && (
        <div className="app-top-bar__bonus-notice" aria-live="polite">
          <p className="app-top-bar__bonus-message">
            <span className="app-top-bar__bonus-kicker">Level boost unlocked</span>
            <span className="app-top-bar__bonus-main">
              +{bonusXPNotice.xp} XP for {bonusXPNotice.reason}. Keep the momentum!
            </span>
          </p>
          <button
            type="button"
            className="app-top-bar__bonus-dismiss"
            onClick={dismissBonusXPNotice}
          >
            Dismiss
          </button>
        </div>
      )}
    </header>
  );
}
