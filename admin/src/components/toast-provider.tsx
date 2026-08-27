"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  type ToastItem,
  type ToastType,
} from "@/lib/toast-store";

const TYPE_STYLES: Record<
  ToastType,
  { shell: string; icon: string; label: string }
> = {
  success: {
    shell: "border-success/25 bg-surface text-foreground",
    icon: "text-success",
    label: "Success",
  },
  error: {
    shell: "border-danger/30 bg-surface text-foreground",
    icon: "text-danger",
    label: "Error",
  },
  warning: {
    shell: "border-warning/30 bg-surface text-foreground",
    icon: "text-warning",
    label: "Warning",
  },
  info: {
    shell: "border-info/25 bg-surface text-foreground",
    icon: "text-info",
    label: "Info",
  },
};

function ToastIcon({ type }: { type: ToastType }) {
  const className = cn("h-4 w-4 shrink-0", TYPE_STYLES[type].icon);
  switch (type) {
    case "success":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L9 11.94 7.28 10.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "error":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
      );
    case "warning":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      );
  }
}

function ToastCard({ item }: { item: ToastItem }) {
  const styles = TYPE_STYLES[item.type];
  const isAssertive = item.type === "error" || item.type === "warning";

  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration]);

  return (
    <div
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-3 text-sm shadow-[var(--shadow-card)] animate-toast-in",
        styles.shell,
      )}
    >
      <span className="mt-0.5" title={styles.label}>
        <ToastIcon type={item.type} />
        <span className="sr-only">{styles.label}: </span>
      </span>
      <p className="min-w-0 flex-1 leading-snug text-foreground">{item.message}</p>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="shrink-0 rounded-[var(--radius-sm)] p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="Dismiss notification"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>(() => getToasts());

  useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4 sm:pt-[max(1rem,calc(var(--header-height)+0.5rem))]"
      aria-label="Notifications"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

/**
 * Mount once under AdminProviders so `toast.*` works across the Admin app.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}
