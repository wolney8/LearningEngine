import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { LevelProgress } from "../utils/levelProgress";
import { XPWidget } from "./XPWidget";
import "./AppTopBar.css";

interface AppTopBarProps {
  xp: number;
  levelProgress: LevelProgress;
}

export function AppTopBar({ xp, levelProgress }: AppTopBarProps) {
  const { status, user, logout } = useAuth();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAuthenticated = status === "authenticated" && Boolean(user);

  return (
    <header className="app-top-bar" data-testid="app-top-bar">
      <div className="app-top-bar__inner">
        <Link to="/" className="app-top-bar__brand" aria-label="Go to home">
          Local Learning Engine
        </Link>

        <div className="app-top-bar__right-cluster">
          <XPWidget xp={xp} levelProgress={levelProgress} compact />

          {isAuthenticated && user ? (
            <>
              <div className="app-top-bar__auth app-top-bar__auth--desktop">
                <span className="app-top-bar__profile">{user.username}</span>
                <button
                  type="button"
                  className="app-top-bar__sign-out"
                  onClick={logout}
                >
                  Sign out
                </button>
              </div>

              <div className="app-top-bar__auth app-top-bar__auth--mobile">
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
                    <p className="app-top-bar__menu-profile">{user.username}</p>
                    <button
                      type="button"
                      className="app-top-bar__menu-link"
                      onClick={logout}
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

              <div className="app-top-bar__auth app-top-bar__auth--mobile">
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
                    <Link to="/register" className="app-top-bar__menu-link">
                      Create account
                    </Link>
                    <Link to="/login" className="app-top-bar__menu-link">
                      Sign in
                    </Link>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
