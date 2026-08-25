"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconClose } from "@/components/ui/icons";

export type ToastTone = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  tone: ToastTone;
};

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: ToastItem = {
      id,
      title: toast.title,
      description: toast.description,
      tone: toast.tone ?? "info",
      durationMs: toast.durationMs,
    };
    setToasts((prev) => [...prev.slice(-3), item]);
    const duration = toast.durationMs ?? DEFAULT_DURATION;
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ title, description, tone: "success" }),
      error: (title, description) => push({ title, description, tone: "error" }),
      info: (title, description) => push({ title, description, tone: "info" }),
    }),
    [push],
  );

  const portal =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pb-6 sm:items-end sm:pr-6"
            aria-live="polite"
            aria-relevant="additions"
          >
            {toasts.map((toast) => (
              <div
                key={toast.id}
                role={toast.tone === "error" ? "alert" : "status"}
                className={cn(
                  "pointer-events-auto flex w-full max-w-sm items-start gap-3 border bg-surface px-4 py-3 shadow-card",
                  toast.tone === "error" && "border-sale/40",
                  toast.tone === "success" && "border-accent/35",
                  toast.tone === "info" && "border-border",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tracking-tight text-foreground">
                    {toast.title}
                  </p>
                  {toast.description ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {toast.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Dismiss"
                  onClick={() => dismiss(toast.id)}
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
