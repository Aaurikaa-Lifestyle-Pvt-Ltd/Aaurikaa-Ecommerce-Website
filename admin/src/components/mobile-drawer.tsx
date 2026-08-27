"use client";

import { useEffect } from "react";
import { NavLinks } from "./nav-links";

export function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 animate-fade-in"
        aria-label="Close menu"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 left-0 flex w-[min(100%,var(--drawer-width))] flex-col bg-surface shadow-xl animate-slide-in-left">
        <div className="flex h-[var(--header-height)] items-center justify-between border-b border-border px-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              AAURIKAA
            </p>
            <p className="text-sm font-semibold text-foreground">Admin</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] hover:bg-muted touch-manipulation"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks onNavigate={onClose} variant="drawer" />
        </div>
      </aside>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
