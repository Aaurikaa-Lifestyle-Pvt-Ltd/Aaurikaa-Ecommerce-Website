"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  CONTACT_ENQUIRY_CATEGORIES,
  CONTACT_FIELD_LABELS,
  submitContactEnquiry,
  validateContactEnquiryInput,
  type EnquiryCategory,
} from "@/lib/api/enquiries";
import { ApiError, userMessageForKind } from "@/lib/api/errors";
import { getShopperUser } from "@/lib/api/token-store";
import { cn } from "@/lib/cn";

type EnquiryFormProps = {
  className?: string;
};

type FieldKey = "email" | "subject" | "message" | "orderInvoiceNumber";

function customerFacingError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === "validation" || err.kind === "forbidden") {
      return err.message;
    }
    return userMessageForKind(err.kind, err.message);
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return "Unable to submit your enquiry. Please try again.";
}

export function EnquiryForm({ className }: EnquiryFormProps) {
  const searchParams = useSearchParams();
  const toast = useToast();
  const formId = useId();
  const productSlug = searchParams.get("product")?.trim() || "";

  const sessionUser = useMemo(() => getShopperUser(), []);

  const [name, setName] = useState(
    sessionUser?.firstName
      ? [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ")
      : "",
  );
  const [email, setEmail] = useState(sessionUser?.email ?? "");
  const [phone, setPhone] = useState(sessionUser?.phone ?? "");
  const [subject, setSubject] = useState(
    productSlug ? `Question about ${productSlug}` : "",
  );
  const [category, setCategory] = useState<EnquiryCategory | "">(
    productSlug ? "product" : "support",
  );
  const [orderInvoiceNumber, setOrderInvoiceNumber] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [enquiryNumber, setEnquiryNumber] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError(null);

    const input = {
      subject,
      message,
      category: category || undefined,
      orderInvoiceNumber: orderInvoiceNumber.trim() || undefined,
      submitter: {
        email,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      },
    };

    const validationError = validateContactEnquiryInput(input);
    if (validationError) {
      const next: Partial<Record<FieldKey, string>> = {};
      if (!String(subject).trim()) next.subject = "Please enter a subject.";
      if (String(message).trim().length < 10) {
        next.message = "Please enter at least 10 characters.";
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
        next.email = "Please enter a valid email address.";
      }
      if (String(orderInvoiceNumber).trim().length > 64) {
        next.orderInvoiceNumber = "Please check this order / invoice number.";
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
        "Enquiry received",
        "We'll be in touch shortly.",
      );
    } catch (err) {
      const messageText = customerFacingError(err);
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
        <p className="font-medium text-foreground">Thank you</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your enquiry has been received. We&apos;ll be in touch shortly at the
          email you provided.
        </p>
        <p className="text-sm text-muted-foreground">
          Reference:{" "}
          <span className="font-medium text-foreground">{enquiryNumber}</span>
        </p>
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const emailErrorId = `${formId}-email-error`;
  const subjectErrorId = `${formId}-subject-error`;
  const messageErrorId = `${formId}-message-error`;
  const orderErrorId = `${formId}-order-error`;
  const formErrorId = `${formId}-form-error`;

  return (
    <div className={cn("max-w-xl", className)}>
      <h2 className="font-serif text-2xl tracking-tight">Send an enquiry</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Share your question and we will respond by email. Sign in is optional.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={onSubmit}
        noValidate
        aria-busy={submitting}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">{CONTACT_FIELD_LABELS.name}</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className={fieldClass}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">{CONTACT_FIELD_LABELS.phone}</span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={submitting}
              className={fieldClass}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium">
            {CONTACT_FIELD_LABELS.email}{" "}
            <span className="text-sale" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? emailErrorId : undefined}
            className={fieldClass}
          />
          {fieldErrors.email ? (
            <span id={emailErrorId} className="mt-1 block text-xs text-sale">
              {fieldErrors.email}
            </span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium">
            {CONTACT_FIELD_LABELS.subject}{" "}
            <span className="text-sale" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </span>
          <input
            type="text"
            name="subject"
            required
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.subject)}
            aria-describedby={fieldErrors.subject ? subjectErrorId : undefined}
            className={fieldClass}
          />
          {fieldErrors.subject ? (
            <span id={subjectErrorId} className="mt-1 block text-xs text-sale">
              {fieldErrors.subject}
            </span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium">{CONTACT_FIELD_LABELS.category}</span>
          <select
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as EnquiryCategory | "")}
            disabled={submitting}
            className={fieldClass}
          >
            <option value="">Select an option (optional)</option>
            {CONTACT_ENQUIRY_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="font-medium">{CONTACT_FIELD_LABELS.orderInvoiceNumber}</span>
          <input
            type="text"
            name="orderInvoiceNumber"
            autoComplete="off"
            value={orderInvoiceNumber}
            onChange={(e) => setOrderInvoiceNumber(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.orderInvoiceNumber)}
            aria-describedby={
              fieldErrors.orderInvoiceNumber
                ? orderErrorId
                : `${formId}-order-hint`
            }
            className={fieldClass}
            placeholder="Optional"
          />
          <span
            id={`${formId}-order-hint`}
            className="mt-1 block text-xs text-muted-foreground"
          >
            Optional — add this if your enquiry is about a specific order.
          </span>
          {fieldErrors.orderInvoiceNumber ? (
            <span id={orderErrorId} className="mt-1 block text-xs text-sale">
              {fieldErrors.orderInvoiceNumber}
            </span>
          ) : null}
        </label>

        <label className="block text-sm">
          <span className="font-medium">
            {CONTACT_FIELD_LABELS.message}{" "}
            <span className="text-sale" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </span>
          <textarea
            name="message"
            required
            minLength={10}
            maxLength={5000}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={submitting}
            aria-invalid={Boolean(fieldErrors.message)}
            aria-describedby={
              fieldErrors.message ? messageErrorId : `${formId}-message-hint`
            }
            className={cn(fieldClass, "resize-y")}
          />
          <span
            id={`${formId}-message-hint`}
            className="mt-1 block text-xs text-muted-foreground"
          >
            At least 10 characters.
          </span>
          {fieldErrors.message ? (
            <span id={messageErrorId} className="mt-1 block text-xs text-sale">
              {fieldErrors.message}
            </span>
          ) : null}
        </label>

        {error ? (
          <p id={formErrorId} className="text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={submitting}
          aria-disabled={submitting}
        >
          {submitting ? "Sending…" : "Send enquiry"}
        </Button>
      </form>
    </div>
  );
}
