"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  submitContactEnquiry,
  validateContactEnquiryInput,
  type EnquiryCategory,
} from "@/lib/api/enquiries";
import { ApiError } from "@/lib/api/errors";
import { getShopperUser } from "@/lib/api/token-store";
import { cn } from "@/lib/cn";

const CATEGORIES: { value: EnquiryCategory; label: string }[] = [
  { value: "support", label: "Support" },
  { value: "product", label: "Product" },
  { value: "other", label: "Other" },
];

type EnquiryFormProps = {
  className?: string;
};

export function EnquiryForm({ className }: EnquiryFormProps) {
  const searchParams = useSearchParams();
  const toast = useToast();
  const productSlug = searchParams.get("product")?.trim() || "";

  const sessionUser = useMemo(() => getShopperUser(), []);

  const [name, setName] = useState(sessionUser?.firstName
    ? [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ")
    : "");
  const [email, setEmail] = useState(sessionUser?.email ?? "");
  const [phone, setPhone] = useState(sessionUser?.phone ?? "");
  const [subject, setSubject] = useState(
    productSlug ? `Question about ${productSlug}` : "",
  );
  const [category, setCategory] = useState<EnquiryCategory | "">(
    productSlug ? "product" : "support",
  );
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [enquiryNumber, setEnquiryNumber] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input = {
      subject,
      message,
      category: category || undefined,
      submitter: {
        email,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      },
    };

    const validationError = validateContactEnquiryInput(input);
    if (validationError) {
      const next: Record<string, string> = {};
      if (!String(subject).trim()) next.subject = "Subject is required.";
      if (String(message).trim().length < 10) {
        next.message = "Message must be at least 10 characters.";
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
        next.email = "A valid email address is required.";
      }
      setFieldErrors(next);
      setError(validationError);
      toast.error("Please check the form", validationError);
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    try {
      const result = await submitContactEnquiry(input);
      setEnquiryNumber(result.enquiryNumber);
      toast.success(
        "Enquiry submitted",
        result.enquiryNumber ? `Reference ${result.enquiryNumber}` : undefined,
      );
    } catch (err) {
      const messageText =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to submit your enquiry. Please try again.";
      setError(messageText);
      toast.error("Enquiry failed", messageText);
    } finally {
      setSubmitting(false);
    }
  }

  if (enquiryNumber) {
    return (
      <div
        className={cn(
          "max-w-xl space-y-3 border border-border bg-surface px-6 py-8",
          className,
        )}
        role="status"
      >
        <p className="font-medium text-foreground">Enquiry submitted</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Thank you. Your reference number is{" "}
          <span className="font-medium text-foreground">{enquiryNumber}</span>.
          We will get back to you at the email you provided.
        </p>
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("max-w-xl", className)}>
      <h2 className="font-serif text-2xl tracking-tight">Send an enquiry</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Share your question and we will respond by email. Sign in is optional.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Phone</span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium">
            Email <span className="text-sale">*</span>
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
            className={fieldClass}
          />
          {fieldErrors.email ? (
            <span className="mt-1 block text-xs text-sale">{fieldErrors.email}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium">
            Subject <span className="text-sale">*</span>
          </span>
          <input
            type="text"
            name="subject"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={Boolean(fieldErrors.subject)}
            className={fieldClass}
          />
          {fieldErrors.subject ? (
            <span className="mt-1 block text-xs text-sale">{fieldErrors.subject}</span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium">Category</span>
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as EnquiryCategory | "")}
            className={fieldClass}
          >
            <option value="">Select (optional)</option>
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">
            Message <span className="text-sale">*</span>
          </span>
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={Boolean(fieldErrors.message)}
            className={cn(fieldClass, "resize-y")}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            At least 10 characters.
          </span>
          {fieldErrors.message ? (
            <span className="mt-1 block text-xs text-sale">{fieldErrors.message}</span>
          ) : null}
        </label>

        {error ? (
          <p className="text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "Sending…" : "Send enquiry"}
        </Button>
      </form>
    </div>
  );
}
