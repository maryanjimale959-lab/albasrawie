"use client";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";

export default function AuthFrame({ title, subtitle, children, footer }) {
  return (
    <div className="auth-wrap">
      <div className="auth-scene" aria-hidden="true">
        <div className="auth-photo" />
        <div className="auth-grid" />
        <div className="auth-veil" />
        <div className="auth-glow auth-glow-a" />
        <div className="auth-glow auth-glow-b" />
      </div>

      <div className="auth-top">
        <ThemeToggle />
      </div>

      <main className="auth-card pop-in">
        <div className="auth-brand">
          <Logo size={38} href="/" />
        </div>
        <div className="auth-card-head">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
        </div>
        {children}
        {footer && <p className="auth-foot-note">{footer}</p>}
      </main>

      <p className="auth-page-foot">Albasrawie — learning progress and classroom management</p>
    </div>
  );
}
