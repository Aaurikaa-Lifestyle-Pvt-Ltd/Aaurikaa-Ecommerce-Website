/** Seller/marketplace static keys must not appear in AAURIKAA Admin CMS. */
export const MARKETPLACE_CMS_PAGE_KEYS = [
  "become-seller",
  "seller-faq",
  "seller-help-center",
  "seller-terms-condition",
  "seller-training",
] as const;

export function isMarketplaceCmsPageKey(pageKey: string): boolean {
  return (MARKETPLACE_CMS_PAGE_KEYS as readonly string[]).includes(pageKey);
}
