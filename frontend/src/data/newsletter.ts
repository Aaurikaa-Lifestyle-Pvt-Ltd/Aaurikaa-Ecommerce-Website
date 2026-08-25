import type { NewsletterContent } from "@/types/commerce";

/**
 * Demo newsletter / "Join the Edit" content (brief §25).
 * UI + local interaction only — no email provider or CRM.
 */
export const newsletter: NewsletterContent = {
  eyebrow: "Stay Close",
  heading: "Join the Edit",
  description:
    "Get new arrivals, styling inspiration and special edits delivered to your inbox.",
  placeholder: "Email address",
  ctaLabel: "Subscribe",
  successMessage: "You're on the list.",
};
