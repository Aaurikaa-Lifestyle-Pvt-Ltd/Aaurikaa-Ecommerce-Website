"use client";

import { useId, useState, type FormEvent } from "react";
import type { NewsletterContent } from "@/types/commerce";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

interface NewsletterSectionProps {
  /**
   * Configurable copy. Pass `null` to hide (API mode with no CMS).
   * Omit only in mock/demo usage — falls through to local defaults.
   */
  content?: NewsletterContent | null;
}

const defaults: NewsletterContent = {
  eyebrow: "Stay Close",
  heading: "Join the Edit",
  description:
    "Get new arrivals, styling inspiration and special edits delivered to your inbox.",
  placeholder: "Email address",
  ctaLabel: "Subscribe",
  successMessage: "You're on the list.",
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * NewsletterSection — "Join the Edit" (brief §25).
 *
 * Fashion-editorial retention invitation. Demo-only local form behaviour —
 * no email provider, CRM, or API. Industry-neutral: understands
 * `NewsletterContent`.
 *
 * Explicit `null` content hides the section (no demo defaults in API mode).
 */
export function NewsletterSection({ content }: NewsletterSectionProps) {
  if (content === null) return null;
  const copy = content ?? defaults;
  const inputId = useId();
  const errorId = useId();
  const successId = useId();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const value = email.trim();
    if (!value) {
      setSuccess(false);
      setError("Please enter your email address.");
      return;
    }
    if (!isValidEmail(value)) {
      setSuccess(false);
      setError("Please enter a valid email address.");
      return;
    }

    setError(null);
    setSuccess(true);
    setEmail("");
  }

  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="mx-auto max-w-xl text-center">
          {copy.eyebrow ? <p className="eyebrow mb-4">{copy.eyebrow}</p> : null}

          <h2 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
            {copy.heading}
          </h2>

          <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            {copy.description}
          </p>

          {success ? (
            <p
              id={successId}
              role="status"
              aria-live="polite"
              className="mt-8 text-sm font-medium tracking-wide text-foreground"
            >
              {copy.successMessage ?? "You're on the list."}
            </p>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-start"
              noValidate
            >
              <div className="min-w-0 flex-1 text-left">
                <label htmlFor={inputId} className="sr-only">
                  Email address
                </label>
                <input
                  id={inputId}
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={copy.placeholder ?? "Email address"}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className={cn(
                    "h-12 w-full rounded-control border bg-surface px-4 text-sm text-foreground placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    error ? "border-sale" : "border-input",
                  )}
                />
                {error ? (
                  <p
                    id={errorId}
                    role="alert"
                    className="mt-2 text-xs text-sale"
                  >
                    {error}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full shrink-0 sm:w-auto"
              >
                {copy.ctaLabel ?? "Subscribe"}
              </Button>
            </form>
          )}
        </div>
      </Container>
    </section>
  );
}
