import { cn } from "@/lib/cn";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

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
