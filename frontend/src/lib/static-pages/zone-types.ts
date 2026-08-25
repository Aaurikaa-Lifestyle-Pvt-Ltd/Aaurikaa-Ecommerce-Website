/**
 * Resolve CMS zone type from known ids + value shape.
 * Unknown types are skipped by the renderer.
 */

export type StaticZoneType =
  | "plainText"
  | "richText"
  | "sectionList"
  | "faqList"
  | "contactCard"
  | "ctaCard"
  | "supportPanel"
  | "linkCardList"
  | "testimonialList"
  | "videoTutorialList"
  | "noticeBanner"
  | "heroBanner"
  | "image"
  | "imageText"
  | "cardGrid"
  | "orderedSections";

const ZONE_TYPE_BY_ID: Record<string, StaticZoneType> = {
  hero: "heroBanner",
  heroSubtitle: "plainText",
  lastUpdated: "plainText",
  supportNote: "plainText",
  intro: "richText",
  mainContent: "richText",
  sections: "orderedSections",
  faqItems: "faqList",
  primaryContactCard: "contactCard",
  contactCard: "contactCard",
  secondarySupportCard: "ctaCard",
  supportCta: "ctaCard",
  closingCta: "ctaCard",
  cookieSupportCta: "ctaCard",
  securityReportBanner: "ctaCard",
  assistanceCta: "ctaCard",
  offerCta: "ctaCard",
  supportPanel: "supportPanel",
  contactChannels: "linkCardList",
  coreValues: "linkCardList",
  helpTopics: "linkCardList",
  testimonials: "testimonialList",
  videoTutorials: "videoTutorialList",
};

/** Preferred render order when zones arrive as an unordered object. */
export const ZONE_RENDER_PRIORITY = [
  "hero",
  "heroSubtitle",
  "lastUpdated",
  "supportNote",
  "intro",
  "mainContent",
  "sections",
  "helpTopics",
  "contactChannels",
  "coreValues",
  "faqItems",
  "videoTutorials",
  "testimonials",
  "primaryContactCard",
  "contactCard",
  "secondarySupportCard",
  "supportCta",
  "closingCta",
  "cookieSupportCta",
  "securityReportBanner",
  "assistanceCta",
  "offerCta",
  "supportPanel",
] as const;

function looksLikeTipTap(value: unknown): boolean {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{")) return false;
    try {
      const parsed = JSON.parse(trimmed) as { type?: string };
      return parsed?.type === "doc";
    } catch {
      return false;
    }
  }
  return Boolean(value && typeof value === "object" && (value as { type?: string }).type === "doc");
}

function hasMediaUrl(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const media = obj.media;
  if (media && typeof media === "object") {
    return Boolean(String((media as { url?: string }).url ?? "").trim());
  }
  return Boolean(String(obj.url ?? obj.imageUrl ?? "").trim());
}

/**
 * When id is "sections", prefer orderedSections if items carry a type field;
 * otherwise fall back to legacy sectionList.
 */
function resolveSectionsType(value: unknown): StaticZoneType {
  if (!Array.isArray(value) || value.length === 0) return "orderedSections";
  const first = value[0];
  if (first && typeof first === "object" && "type" in (first as object)) {
    return "orderedSections";
  }
  if (
    first &&
    typeof first === "object" &&
    ("bodyRichText" in (first as object) || "body" in (first as object)) &&
    "title" in (first as object)
  ) {
    return "sectionList";
  }
  return "orderedSections";
}

export function resolveZoneType(id: string, value: unknown): StaticZoneType | null {
  if (id === "sections") return resolveSectionsType(value);
  if (ZONE_TYPE_BY_ID[id]) return ZONE_TYPE_BY_ID[id];
  if (value == null) return null;
  if (typeof value === "string") {
    return looksLikeTipTap(value) ? "richText" : "plainText";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Empty arrays: prefer known id mapping already handled; otherwise skip
      return null;
    }
    const first = value[0];
    if (!first || typeof first !== "object") return null;
    const item = first as Record<string, unknown>;
    if ("type" in item && typeof item.type === "string") return "orderedSections";
    if ("q" in item && "a" in item) return "faqList";
    if ("title" in item && ("bodyRichText" in item || "body" in item)) return "sectionList";
    if ("title" in item && ("media" in item || "description" in item || "href" in item)) {
      return "media" in item ? "cardGrid" : "linkCardList";
    }
    if ("name" in item && "comment" in item) return "testimonialList";
    if ("title" in item && "url" in item) return "videoTutorialList";
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("actions" in obj && Array.isArray(obj.actions)) return "supportPanel";
    if ("organizationName" in obj || "addressLines" in obj) return "contactCard";
    if (
      "media" in obj &&
      ("title" in obj || "subcopy" in obj || "ctaLabel" in obj || "ctaHref" in obj)
    ) {
      return "heroBanner";
    }
    if ("media" in obj && ("bodyRichText" in obj || "imagePosition" in obj)) {
      return "imageText";
    }
    if ("media" in obj && Object.keys(obj).length <= 2) {
      return "image";
    }
    if ("buttonHref" in obj || "buttonLabel" in obj) return "ctaCard";
    if ("heading" in obj && "description" in obj && !("buttonHref" in obj)) return "noticeBanner";
  }
  return null;
}

export function orderedZoneEntries(
  zones: Record<string, unknown>,
): Array<[string, unknown]> {
  const remaining = new Set(Object.keys(zones));
  const ordered: Array<[string, unknown]> = [];
  for (const id of ZONE_RENDER_PRIORITY) {
    if (remaining.has(id)) {
      ordered.push([id, zones[id]]);
      remaining.delete(id);
    }
  }
  for (const id of remaining) {
    ordered.push([id, zones[id]]);
  }
  return ordered;
}

export function hasRenderableZones(zones: Record<string, unknown>): boolean {
  return orderedZoneEntries(zones).some(([id, value]) => {
    const type = resolveZoneType(id, value);
    return type != null && !isEmptyZoneValue(type, value);
  });
}

export function isEmptyZoneValue(type: StaticZoneType, value: unknown): boolean {
  if (value == null) return true;
  if (type === "plainText") return !String(value).trim();
  if (type === "richText") {
    if (!looksLikeTipTap(value)) return !String(value ?? "").trim();
    try {
      const doc =
        typeof value === "string"
          ? (JSON.parse(value) as { content?: unknown[] })
          : (value as { content?: unknown[] });
      if (!Array.isArray(doc.content) || doc.content.length === 0) return true;
      // Treat empty single paragraph as empty
      if (
        doc.content.length === 1 &&
        (doc.content[0] as { type?: string; content?: unknown[] })?.type === "paragraph" &&
        (!(doc.content[0] as { content?: unknown[] }).content ||
          (doc.content[0] as { content?: unknown[] }).content!.length === 0)
      ) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  }
  if (
    type === "sectionList" ||
    type === "faqList" ||
    type === "linkCardList" ||
    type === "testimonialList" ||
    type === "videoTutorialList" ||
    type === "cardGrid" ||
    type === "orderedSections"
  ) {
    return !Array.isArray(value) || value.length === 0;
  }
  if (type === "heroBanner") {
    if (!value || typeof value !== "object") return true;
    const obj = value as Record<string, unknown>;
    const hasCopy = Boolean(
      String(obj.title ?? "").trim() ||
        String(obj.subcopy ?? "").trim() ||
        String(obj.ctaLabel ?? "").trim(),
    );
    return !hasMediaUrl(value) && !hasCopy;
  }
  if (type === "image") {
    return !hasMediaUrl(value);
  }
  if (type === "imageText") {
    if (!value || typeof value !== "object") return true;
    const obj = value as Record<string, unknown>;
    const body = obj.bodyRichText ?? obj.body;
    const bodyEmpty =
      body == null ||
      (typeof body === "string" && !body.trim()) ||
      (looksLikeTipTap(body) && isEmptyZoneValue("richText", body));
    return !hasMediaUrl(value) && bodyEmpty;
  }
  if (type === "contactCard" || type === "ctaCard" || type === "supportPanel" || type === "noticeBanner") {
    if (!value || typeof value !== "object") return true;
    const obj = value as Record<string, unknown>;
    return !String(obj.heading ?? "").trim();
  }
  return false;
}
