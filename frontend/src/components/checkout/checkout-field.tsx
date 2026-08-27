"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  hint?: string;
}

export function Field({ id, label, error, children, className, hint }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-sale" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function TextInput({ className, error, ...props }: TextInputProps) {
  return (
    <input
      className={cn(
        inputClass,
        error && "border-sale focus-visible:ring-sale",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}

export function PasswordInput({ className, error, ...props }: TextInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={cn(
          inputClass,
          "pr-10",
          error && "border-sale focus-visible:ring-sale",
          className,
        )}
        aria-invalid={error || undefined}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShow((prev) => !prev);
        }}
        className="absolute right-0 top-0 z-10 flex h-11 w-11 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
        aria-label={show ? "Hide password" : "Show password"}
        title={show ? "Hide password" : "Show password"}
      >
        {show ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
            <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
            <path d="M17.479 17.499A10.75 10.75 0 0 1 2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.146-4.99" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

interface TextTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function TextTextarea({ className, error, ...props }: TextTextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        error && "border-sale focus-visible:ring-sale",
        className,
      )}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export function SelectInput({ className, error, children, ...props }: SelectInputProps) {
  return (
    <select
      className={cn(
        inputClass,
        "appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10",
        error && "border-sale focus-visible:ring-sale",
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
      }}
      aria-invalid={error || undefined}
      {...props}
    >
      {children}
    </select>
  );
}
