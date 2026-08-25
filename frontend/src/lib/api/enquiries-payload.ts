/** Pure contact / well-wisher enquiry payload + validation (no HTTP client). */

export type EnquiryCategory = "product" | "support" | "other";

export type WellWisherCategory =
  | "feature"
  | "bug"
  | "experience"
  | "product"
  | "website"
  | "payment"
  | "delivery"
  | "support"
  | "policy"
  | "other";

export type ContactEnquiryInput = {
  subject: string;
  message: string;
  submitter: {
    email: string;
    name?: string;
    phone?: string;
  };
  category?: EnquiryCategory;
};

export type WellWisherEnquiryInput = {
  message: string;
  category: WellWisherCategory;
  submitter: {
    email: string;
    name?: string;
    phone?: string;
    anonymous?: boolean;
  };
  rating?: number;
  subject?: string;
};

const ALLOWED_CATEGORIES: readonly EnquiryCategory[] = [
  "product",
  "support",
  "other",
];

export const WELL_WISHER_CATEGORIES: readonly {
  value: WellWisherCategory;
  label: string;
}[] = [
  { value: "experience", label: "Feedback / experience" },
  { value: "feature", label: "Suggestion / feature idea" },
  { value: "bug", label: "Issue or complaint" },
  { value: "product", label: "Product" },
  { value: "website", label: "Website" },
  { value: "payment", label: "Payment" },
  { value: "delivery", label: "Delivery" },
  { value: "support", label: "Support" },
  { value: "policy", label: "Policy" },
  { value: "other", label: "Other" },
];

const ALLOWED_WELL_WISHER: readonly WellWisherCategory[] =
  WELL_WISHER_CATEGORIES.map((item) => item.value);

export function buildContactEnquiryPayload(
  input: ContactEnquiryInput,
): Record<string, unknown> {
  const email = String(input.submitter.email ?? "").trim();
  const subject = String(input.subject ?? "").trim();
  const message = String(input.message ?? "").trim();
  const name = String(input.submitter.name ?? "").trim();
  const phone = String(input.submitter.phone ?? "").trim();

  const payload: Record<string, unknown> = {
    source: "contact",
    subject,
    message,
    submitter: {
      email,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
    },
  };

  if (input.category && ALLOWED_CATEGORIES.includes(input.category)) {
    payload.category = input.category;
  }

  return payload;
}

export function buildWellWisherEnquiryPayload(
  input: WellWisherEnquiryInput,
): Record<string, unknown> {
  const email = String(input.submitter.email ?? "").trim();
  const message = String(input.message ?? "").trim();
  const name = String(input.submitter.name ?? "").trim();
  const phone = String(input.submitter.phone ?? "").trim();
  const subject = String(input.subject ?? "").trim();

  const payload: Record<string, unknown> = {
    source: "well-wisher",
    message,
    category: input.category,
    submitter: {
      email,
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
      ...(input.submitter.anonymous ? { anonymous: true } : {}),
    },
  };

  if (subject) payload.subject = subject;
  if (input.rating != null) payload.rating = input.rating;

  return payload;
}

export function validateContactEnquiryInput(input: ContactEnquiryInput): string | null {
  const subject = String(input.subject ?? "").trim();
  const message = String(input.message ?? "").trim();
  const email = String(input.submitter.email ?? "").trim();

  if (!subject) return "Subject is required.";
  if (subject.length > 200) return "Subject must be 200 characters or fewer.";
  if (message.length < 10) return "Message must be at least 10 characters.";
  if (message.length > 5000) return "Message must be 5000 characters or fewer.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "A valid email address is required.";
  }
  if (input.category && !ALLOWED_CATEGORIES.includes(input.category)) {
    return "Please choose a valid category.";
  }
  return null;
}

export function validateWellWisherEnquiryInput(
  input: WellWisherEnquiryInput,
): string | null {
  const message = String(input.message ?? "").trim();
  const email = String(input.submitter.email ?? "").trim();

  if (!ALLOWED_WELL_WISHER.includes(input.category)) {
    return "Please choose a category.";
  }
  if (message.length < 10) return "Message must be at least 10 characters.";
  if (message.length > 5000) return "Message must be 5000 characters or fewer.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "A valid email address is required.";
  }
  if (input.rating != null) {
    const rating = Number(input.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return "Rating must be between 1 and 5.";
    }
  }
  return null;
}
