/**
 * Imperative toast store for AAURIKAA Admin.
 *
 * Usage:
 *   import { toast } from "@/lib/toast";
 *   toast.success("Product saved successfully");
 *   toast.error("Unable to save product");
 *   toast.warning("Some products require review");
 *   toast.info("Import processing has started");
 *
 * Or: toast({ type: "success", message: "…", duration: 4000 })
 */

export type ToastType = "success" | "error" | "warning" | "info";

export type ToastInput = {
  type?: ToastType;
  message: string;
  duration?: number;
  id?: string;
};

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  createdAt: number;
};

/** Centralized auto-dismiss defaults (ms). */
export const TOAST_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 5000,
};

/** Cap visible toasts to avoid flooding the viewport. */
export const TOAST_MAX_VISIBLE = 5;

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function emit() {
  const snapshot = toasts;
  for (const listener of listeners) listener(snapshot);
}

function nextId(): string {
  seq += 1;
  return `toast-${Date.now()}-${seq}`;
}

export function getToasts(): ToastItem[] {
  return toasts;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: string): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function clearToasts(): void {
  if (toasts.length === 0) return;
  toasts = [];
  emit();
}

export function pushToast(input: ToastInput): string {
  const type = input.type ?? "info";
  const message = input.message.trim();
  if (!message) return "";

  const id = input.id ?? nextId();
  const duration =
    typeof input.duration === "number" && input.duration >= 0
      ? input.duration
      : TOAST_DURATIONS[type];

  const item: ToastItem = {
    id,
    type,
    message,
    duration,
    createdAt: Date.now(),
  };

  // Deduplicate identical back-to-back toasts (same type + message within 600ms).
  const recent = toasts[toasts.length - 1];
  if (
    recent &&
    recent.type === item.type &&
    recent.message === item.message &&
    item.createdAt - recent.createdAt < 600
  ) {
    return recent.id;
  }

  let next = [...toasts, item];
  if (next.length > TOAST_MAX_VISIBLE) {
    next = next.slice(next.length - TOAST_MAX_VISIBLE);
  }
  toasts = next;
  emit();
  return id;
}

function createToastApi() {
  const call = (input: ToastInput | string) => {
    if (typeof input === "string") {
      return pushToast({ type: "info", message: input });
    }
    return pushToast(input);
  };

  return Object.assign(call, {
    success(message: string, duration?: number) {
      return pushToast({ type: "success", message, duration });
    },
    error(message: string, duration?: number) {
      return pushToast({ type: "error", message, duration });
    },
    warning(message: string, duration?: number) {
      return pushToast({ type: "warning", message, duration });
    },
    info(message: string, duration?: number) {
      return pushToast({ type: "info", message, duration });
    },
    dismiss: dismissToast,
    clear: clearToasts,
  });
}

export const toast = createToastApi();

/** Reset store between tests. */
export function __resetToastStoreForTests() {
  toasts = [];
  seq = 0;
  emit();
}
