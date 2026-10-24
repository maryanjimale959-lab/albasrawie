"use client";
import { Logo } from "./Logo";
import ThemeToggle from "./ThemeToggle";
import BuiltBy from "./BuiltBy";

export default function AuthFrame({ title, subtitle, children, footer, tagline = "Albasrawie" }) {
  return (
    <div className="auth-wrap">
      <div className="auth-scene" aria-hidden="true">
        <div className="auth-photo" />
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
        <div className="auth-card-foot">
          {footer && <p className="auth-foot-note">{footer}</p>}
          <p className="auth-tagline">{tagline}</p>
          <BuiltBy variant="auth" />
        </div>
      </main>
    </div>
  );
}
