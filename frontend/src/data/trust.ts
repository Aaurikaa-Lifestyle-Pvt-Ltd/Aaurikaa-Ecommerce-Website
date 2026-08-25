import type { TrustItem } from "@/types/commerce";

/**
 * Demo trust / service benefits (brief §24).
 * Aligned with storefront policies already surfaced in site config
 * (complimentary shipping threshold, returns, contact). Language stays
 * cautious — no unsupported guarantees.
 */
export const trustItems: TrustItem[] = [
  {
    id: "shipping",
    icon: "shipping",
    title: "Complimentary Shipping",
    description: "On orders over ₹1,499.",
  },
  {
    id: "returns",
    icon: "returns",
    title: "Easy Returns",
    description: "Simple return process on eligible orders.",
  },
  {
    id: "support",
    icon: "support",
    title: "Customer Support",
    description: "We're here when you need us.",
  },
  {
    id: "secure",
    icon: "secure",
    title: "Secure Checkout",
    description: "Protected payment experience.",
  },
];
