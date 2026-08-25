import { apiRequest } from "./client";

export type ActiveOffer = {
  id: string;
  text: string;
  title: string;
  isActive: boolean;
};

/**
 * Public active offers — raw array, no success wrapper
 * (`GET /api/admin/offers/active?type=announcement`).
 */
export async function fetchActiveOffers(
  type: string = "announcement",
): Promise<ActiveOffer[]> {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  const qs = params.toString();
  const response = await apiRequest<unknown>(
    `/api/admin/offers/active${qs ? `?${qs}` : ""}`,
    { auth: false },
  );
  if (!Array.isArray(response)) return [];
  return response
    .map((item) => {
      const raw = item as Record<string, unknown>;
      const id = String(raw._id ?? raw.id ?? "").trim();
      const offerType = String(raw.type ?? "announcement").trim();
      return {
        id,
        text: String(raw.text ?? "").trim(),
        title: String(raw.title ?? "").trim(),
        isActive: raw.isActive !== false,
        type: offerType,
      };
    })
    .filter(
      (offer) =>
        offer.id &&
        offer.isActive &&
        (offer.text || offer.title) &&
        (!type || offer.type === type || !offer.type),
    )
    .map(({ id, text, title, isActive }) => ({ id, text, title, isActive }));
}

/** Active announcement lines for the storefront bar (priority order preserved). */
export async function fetchAnnouncementLines(): Promise<string[]> {
  const offers = await fetchActiveOffers("announcement");
  return offers
    .map((offer) => offer.text || offer.title)
    .filter((line): line is string => Boolean(line));
}

/** First offer line for the announcement bar, or null when none. */
export async function fetchAnnouncementText(): Promise<string | null> {
  const lines = await fetchAnnouncementLines();
  return lines[0] ?? null;
}
