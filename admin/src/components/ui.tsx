import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none touch-manipulation",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-base",
        variant === "primary" &&
          "bg-primary text-primary-foreground hover:bg-slate-800",
        variant === "secondary" &&
          "bg-surface text-foreground border border-border hover:bg-muted",
        variant === "ghost" && "bg-transparent text-foreground hover:bg-muted",
        variant === "danger" && "bg-danger text-white hover:bg-red-700",
        className,
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-[var(--radius-sm)] border border-input bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[var(--radius-sm)] border border-input bg-surface px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-[var(--radius-sm)] border border-input bg-surface px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-ring/20",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({
  className,
  children,
  htmlFor,
}: {
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border border-border bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm text-danger" role="alert">
        {message}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function SaveToast({ show, message = "Saved" }: { show: boolean; message?: string }) {
  if (!show) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg animate-rise-in"
    >
      {message}
    </div>
  );
}
