"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  submitWellWisherEnquiry,
  validateWellWisherEnquiryInput,
  WELL_WISHER_CATEGORIES,
  type WellWisherCategory,
} from "@/lib/api/enquiries";
import { ApiError } from "@/lib/api/errors";
import { getShopperUser } from "@/lib/api/token-store";
import { cn } from "@/lib/cn";

type WellWisherFormProps = {
  className?: string;
};

export function WellWisherForm({ className }: WellWisherFormProps) {
  const toast = useToast();
  const sessionUser = useMemo(() => getShopperUser(), []);

  const [name, setName] = useState(
    sessionUser?.firstName
      ? [sessionUser.firstName, sessionUser.lastName].filter(Boolean).join(" ")
      : "",
  );
  const [email, setEmail] = useState(sessionUser?.email ?? "");
  const [phone, setPhone] = useState(sessionUser?.phone ?? "");
  const [category, setCategory] = useState<WellWisherCategory | "">("experience");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [rating, setRating] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enquiryNumber, setEnquiryNumber] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!category) {
      setError("Please choose a category.");
      toast.error("Please check the form", "Please choose a category.");
      return;
    }

    const ratingNumber = rating ? Number(rating) : undefined;
    const input = {
      category,
      message,
      rating: ratingNumber,
      submitter: {
        email,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        anonymous,
      },
    };

    const validationError = validateWellWisherEnquiryInput(input);
    if (validationError) {
      setError(validationError);
      toast.error("Please check the form", validationError);
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitWellWisherEnquiry(input);
      setEnquiryNumber(result.enquiryNumber);
      toast.success(
        "Thank you for your feedback",
        result.enquiryNumber ? `Reference ${result.enquiryNumber}` : undefined,
      );
    } catch (err) {
      const messageText =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unable to submit your feedback. Please try again.";
      setError(messageText);
      toast.error("Submission failed", messageText);
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
        <p className="font-medium text-foreground">Feedback received</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Thank you for sharing with AAURIKAA. Your reference number is{" "}
          <span className="font-medium text-foreground">{enquiryNumber}</span>.
        </p>
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-control border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className={cn("max-w-xl", className)}>
      <h2 className="font-serif text-2xl tracking-tight">Share feedback</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Suggestions, compliments, and concerns help us improve. Sign in is optional.
      </p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
        <label className="block text-sm">
          <span className="font-medium">
            Category <span className="text-sale">*</span>
          </span>
          <select
            name="category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as WellWisherCategory | "")}
            className={fieldClass}
          >
            <option value="">Select a category</option>
            {WELL_WISHER_CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Name</span>
            <input
              type="text"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={anonymous}
              className={cn(fieldClass, anonymous && "opacity-60")}
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
            className={fieldClass}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <span>Submit anonymously (email still required for follow-up)</span>
        </label>

        <label className="block text-sm">
          <span className="font-medium">Rating (optional)</span>
          <select
            name="rating"
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className={fieldClass}
          >
            <option value="">No rating</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {n} / 5
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
            className={cn(fieldClass, "resize-y")}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            At least 10 characters.
          </span>
        </label>

        {error ? (
          <p className="text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" size="lg" disabled={submitting}>
          {submitting ? "Sending…" : "Send feedback"}
        </Button>
      </form>
    </div>
  );
}
