export type FaqItem = { category?: string; q?: string; a?: string };

export type CardGridItem = {
  title?: string;
  description?: string;
  href?: string;
  media?: { url?: string; alt?: string; mediaId?: string; caption?: string };
};

export type OrderedSection = {
  type: string;
  id?: string;
  heading?: string;
  bodyRichText?: string;
  media?: { url?: string; alt?: string; mediaId?: string; caption?: string };
  imagePosition?: "left" | "right";
  items?: FaqItem[] | CardGridItem[];
  title?: string;
  subcopy?: string;
  ctaLabel?: string;
  ctaHref?: string;
  description?: string;
  buttonLabel?: string;
  buttonHref?: string;
  intro?: string;
  organizationName?: string;
  phone?: string;
  email?: string;
  addressLines?: string[];
  actions?: Array<{ label?: string; href?: string }>;
};

function editableBodyText(value: unknown): string {
  if (value == null) return "";
  if (typeof value !== "string") return String(value).trim();
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const doc = JSON.parse(trimmed) as {
      type?: string;
      content?: Array<{ type?: string; content?: Array<{ text?: string }> }>;
    };
    if (doc?.type !== "doc" || !Array.isArray(doc.content)) return trimmed;
    const parts: string[] = [];
    for (const block of doc.content) {
      if (!block || typeof block !== "object") continue;
      for (const child of block.content ?? []) {
        if (child?.text) parts.push(child.text);
      }
    }
    return parts.join("\n").trim();
  } catch {
    return trimmed;
  }
}

/**
 * Drop incomplete ordered-section stubs so draft saves stay valid.
 */
export function pruneOrderedSections(sections: OrderedSection[]): OrderedSection[] {
  return sections.filter((section) => {
    const type = section.type;
    if (type === "richText") {
      const heading = String(section.heading ?? "").trim();
      const body = editableBodyText(section.bodyRichText);
      return Boolean(heading || body);
    }
    if (type === "image") {
      return Boolean(String(section.media?.url ?? "").trim());
    }
    if (type === "imageText") {
      const hasMedia = Boolean(String(section.media?.url ?? "").trim());
      const body = editableBodyText(section.bodyRichText);
      return hasMedia || Boolean(body);
    }
    if (type === "cardGrid") {
      const items = Array.isArray(section.items) ? section.items : [];
      return items.some((item) => String((item as CardGridItem).title ?? "").trim());
    }
    if (type === "faqList") {
      const items = Array.isArray(section.items) ? (section.items as FaqItem[]) : [];
      return items.some((item) => String(item.q ?? "").trim() && String(item.a ?? "").trim());
    }
    if (type === "cta" || type === "ctaCard") {
      return Boolean(String(section.heading ?? "").trim());
    }
    if (type === "contactCard") {
      return Boolean(String(section.heading ?? "").trim());
    }
    if (type === "supportPanel") {
      return Boolean(String(section.heading ?? "").trim());
    }
    if (type === "heroBanner") {
      const hasMedia = Boolean(String(section.media?.url ?? "").trim());
      const hasCopy = Boolean(
        String(section.title ?? "").trim() ||
          String(section.subcopy ?? "").trim() ||
          String(section.ctaLabel ?? "").trim(),
      );
      return hasMedia || hasCopy;
    }
    return true;
  });
}
