import { Link } from "react-router-dom";
import "./GuestLimitNotice.css";

interface GuestLimitNoticeProps {
  title?: string;
  message: string;
}

export function GuestLimitNotice({
  title = "Guest limit reached",
  message,
}: GuestLimitNoticeProps) {
  return (
    <section className="guest-limit-notice" role="alert" aria-live="polite">
      <h2 className="guest-limit-notice__title">{title}</h2>
      <p className="guest-limit-notice__message">{message}</p>
      <div className="guest-limit-notice__actions">
        <Link to="/register" className="guest-limit-notice__primary">
          Create account
        </Link>
        <Link to="/login" className="guest-limit-notice__secondary">
          Sign in
        </Link>
      </div>
    </section>
  );
}
