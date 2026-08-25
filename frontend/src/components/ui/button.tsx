import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "link";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:opacity-50 " +
  "rounded-control";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-surface text-foreground border border-border hover:bg-muted",
  outline:
    "border border-foreground/80 text-foreground hover:bg-foreground hover:text-background",
  ghost: "text-foreground hover:bg-muted",
  link: "text-foreground underline-offset-4 hover:underline px-0",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs uppercase tracking-[0.12em]",
  md: "h-11 px-6 text-sm",
  lg: "h-12 px-8 text-sm uppercase tracking-[0.14em]",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  const sizing = variant === "link" ? "" : sizeClasses[size];
  return cn(base, variantClasses[variant], sizing, className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {children}
    </button>
  );
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/** Link styled as a button, for navigational CTAs. */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {children}
    </Link>
  );
}
