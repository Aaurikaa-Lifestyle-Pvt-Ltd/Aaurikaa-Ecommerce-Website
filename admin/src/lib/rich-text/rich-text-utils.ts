export type TiptapJSONNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: TiptapJSONNode[];
  [key: string]: unknown;
};

export type TiptapDoc = {
  type: "doc";
  content: TiptapJSONNode[];
};

export const EMPTY_TIPTAP_DOC: TiptapDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function sanitizeHref(href = ""): string {
  const value = String(href || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return value;
  if (value.startsWith("#")) return value;
  try {
    const u = new URL(value);
    const p = u.protocol.toLowerCase();
    if (["http:", "https:", "mailto:", "tel:"].includes(p)) return value;
    return "";
  } catch {
    return "";
  }
}

/** Server-safe image src: relative paths, http(s), or safe data:image/ URLs only. */
export function sanitizeImageSrc(src = ""): string {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.startsWith("/")) return value;
  if (value.startsWith("#")) return value;
  if (/^data:image\/(png|gif|jpeg|jpg|webp|svg\+xml);base64,/i.test(value)) return value;
  try {
    const u = new URL(value);
    const p = u.protocol.toLowerCase();
    if (["http:", "https:"].includes(p)) return value;
    return "";
  } catch {
    return "";
  }
}

/** Escape string for safe use in attributes and text (no DOMPurify/ESM dependency). */
export function escapeAttr(str = ""): string {
  const s = String(str ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Safe hex color: #RGB or #RRGGBB only. No CSS injection. */
const SAFE_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const TEXT_COLOR_PALETTE = [
  "#000000",
  "#374151",
  "#6B7280",
  "#EF4444",
  "#F59E0B",
  "#10B981",
  "#2563EB",
  "#7C3AED",
  "#EC4899",
];
export const HIGHLIGHT_COLOR_PALETTE = ["#FEF3C7", "#DBEAFE", "#D1FAE5", "#FCE7F3", "#E5E7EB"];

export function sanitizeColor(hex = ""): string | null {
  const v = String(hex || "").trim();
  if (!v) return null;
  if (SAFE_HEX.test(v)) return v;
  return null;
}

export function sanitizeHighlightColor(hex = ""): string | null {
  const v = String(hex || "").trim();
  if (!v) return null;
  if (SAFE_HEX.test(v)) return v;
  return null;
}

export function safeJsonParse(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function isTiptapDoc(data: unknown): data is TiptapDoc {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as TiptapDoc).type === "doc" &&
      Array.isArray((data as TiptapDoc).content),
  );
}

export function isLegacyStructuredDoc(data: unknown): data is { blocks: unknown[] } {
  return Boolean(data && typeof data === "object" && Array.isArray((data as { blocks?: unknown }).blocks));
}

function textNode(text: string, marks: TiptapJSONNode["marks"] = []): TiptapJSONNode {
  return { type: "text", text: text || "", ...(marks.length ? { marks } : {}) };
}

function paragraphNode(text = ""): TiptapJSONNode {
  return { type: "paragraph", content: [textNode(text)] };
}

function convertInlineContent(content: unknown): TiptapJSONNode[] {
  if (typeof content === "string") return [textNode(content)];
  if (!Array.isArray(content)) return [textNode("")];

  const out: TiptapJSONNode[] = [];
  content.forEach((node) => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; value?: string; href?: string; linkType?: string };
    if (n.type === "text") out.push(textNode(n.value || ""));
    if (n.type === "link") {
      out.push(
        textNode(n.value || n.href || "link", [
          {
            type: "link",
            attrs: { href: n.href || "", target: n.linkType === "external" ? "_blank" : null },
          },
        ]),
      );
    }
  });

  return out.length ? out : [textNode("")];
}

function legacyTableToTiptap(rows: unknown[] = [], hasHeader = true): TiptapJSONNode | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return {
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: (Array.isArray(row) ? row : []).map((cell) => ({
        type: hasHeader && rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [paragraphNode(String(cell || ""))],
      })),
    })),
  };
}

export function legacyBlocksToTiptapDoc(blocks: unknown[] = []): TiptapDoc {
  const content: TiptapJSONNode[] = [];

  blocks.forEach((block) => {
    if (!block || typeof block !== "object") return;
    const b = block as Record<string, unknown>;
    if (!b.type) return;
    switch (b.type) {
      case "heading":
        content.push({
          type: "heading",
          attrs: { level: (b.level as number) || 2 },
          content: convertInlineContent(b.content),
        });
        break;
      case "paragraph":
        content.push({ type: "paragraph", content: convertInlineContent(b.content) });
        break;
      case "image":
        content.push({
          type: "image",
          attrs: {
            src: (b.url as string) || "",
            alt: (b.alt as string) || "",
            title: (b.caption as string) || "",
            align: (b.alignment as string) || "center",
            size: (b.size as number) || 100,
          },
        });
        break;
      case "button":
        content.push({
          type: "cta",
          attrs: {
            text: (b.text as string) || "",
            href: (b.link as string) || "",
            linkType: (b.linkType as string) || "internal",
            variant: (b.variant as string) || "primary",
          },
        });
        break;
      case "table": {
        const table = legacyTableToTiptap(b.rows as unknown[], Boolean(b.hasHeader !== false));
        if (table) content.push(table);
        break;
      }
      case "section":
        if (Array.isArray(b.blocks)) {
          const nested = legacyBlocksToTiptapDoc(b.blocks);
          if (Array.isArray(nested.content)) content.push(...nested.content);
        }
        break;
      case "mediaText": {
        const media = b.media as { url?: string; alt?: string; caption?: string } | undefined;
        if (media?.url) {
          content.push({
            type: "image",
            attrs: {
              src: media.url,
              alt: media.alt || "",
              title: media.caption || "",
              align: b.mediaPosition === "left" ? "left" : "right",
              size: (b.mediaWidth as number) || 50,
            },
          });
        }
        if (Array.isArray(b.textBlocks)) {
          b.textBlocks.forEach((tb) => {
            if (tb && typeof tb === "object" && (tb as { type?: string }).type === "paragraph") {
              content.push({
                type: "paragraph",
                content: convertInlineContent((tb as { content?: unknown }).content),
              });
            }
          });
        }
        break;
      }
      default:
        break;
    }
  });

  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function htmlToPlainText(value: string): string {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract plain text from a TipTap/JSON string when parse fails (e.g. truncated). Avoids showing raw JSON. */
function extractTextFromJsonLikeString(str: string): string {
  if (typeof str !== "string" || str.trim().length === 0) return "";
  const s = str.trim();
  if (!s.startsWith("{") && !s.startsWith("[")) return "";
  const textRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = textRegex.exec(s)) !== null) {
    const raw = m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (raw.trim()) parts.push(raw);
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function normalizeToTiptapDoc(content: unknown): TiptapDoc {
  if (!content) return EMPTY_TIPTAP_DOC;
  const parsed = typeof content === "string" ? safeJsonParse(content) : content;

  if (isTiptapDoc(parsed)) return parsed;
  if (isLegacyStructuredDoc(parsed)) return legacyBlocksToTiptapDoc(parsed.blocks);

  if (typeof content !== "string") return EMPTY_TIPTAP_DOC;
  const jsonLikeText = extractTextFromJsonLikeString(content);
  if (jsonLikeText.length > 0) {
    return { type: "doc", content: [{ type: "paragraph", content: [textNode(jsonLikeText)] }] };
  }
  const fallbackText = htmlToPlainText(content);
  return { type: "doc", content: [{ type: "paragraph", content: [textNode(fallbackText)] }] };
}

function sanitizeRichTextNode(node: TiptapJSONNode | null | undefined): TiptapJSONNode | null {
  if (!node || typeof node !== "object") return null;

  const next: TiptapJSONNode = { ...node };

  if (Array.isArray(node.content)) {
    next.content = node.content.map(sanitizeRichTextNode).filter(Boolean) as TiptapJSONNode[];
  }

  if (node.type === "image") {
    const attrs = { ...(node.attrs || {}) };
    const src = String(attrs.src || attrs.url || attrs.public_url || "").trim();

    if (!src) return null;

    attrs.src = src;
    attrs.alt = String(attrs.alt || "Image").trim() || "Image";
    next.attrs = attrs;
  }

  return next;
}

export function sanitizeRichTextForSubmission(content: unknown): string {
  const doc = normalizeToTiptapDoc(content);
  const sanitized: TiptapDoc = {
    ...doc,
    content: (doc.content || []).map(sanitizeRichTextNode).filter(Boolean) as TiptapJSONNode[],
  };

  if (!sanitized.content.length) {
    sanitized.content = [{ type: "paragraph" }];
  }

  return JSON.stringify(sanitized);
}

export function extractPlainTextFromNode(node: TiptapJSONNode | null | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (!Array.isArray(node.content)) return "";
  return node.content.map(extractPlainTextFromNode).join(" ");
}

export function extractPlainText(doc: unknown): string {
  const normalized = normalizeToTiptapDoc(doc);
  return (normalized.content || [])
    .map(extractPlainTextFromNode)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Load TipTap/legacy JSON into a plain textarea without showing raw JSON.
 * Plain strings (and empty) are returned unchanged; structured docs become
 * concatenated text nodes.
 */
export function richTextToPlainText(value: string): string {
  if (value == null) return "";
  const raw = String(value);
  if (raw.trim() === "") return raw;

  const parsed = safeJsonParse(raw);
  if (isTiptapDoc(parsed) || isLegacyStructuredDoc(parsed)) {
    return extractPlainText(parsed);
  }

  const jsonLike = extractTextFromJsonLikeString(raw);
  if (jsonLike.length > 0) return jsonLike;

  return raw;
}

/**
 * For product/list views: get displayable plain text from any field that may be
 * a string, HTML, or structured (TipTap/legacy) content.
 */
export function toPlainTextForList(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" && value.trim() === "") return "";
  return extractPlainText(value);
}

/** Walk TipTap nodes for media/structure that is meaningful without text. */
function nodeHasMeaningfulStructure(node: TiptapJSONNode | null | undefined): boolean {
  if (!node || typeof node !== "object") return false;

  if (node.type === "image") {
    const attrs = node.attrs || {};
    const src = String(attrs.src || attrs.url || attrs.public_url || "").trim();
    return Boolean(sanitizeImageSrc(src));
  }

  if (node.type === "cta" || node.type === "button") {
    return true;
  }

  if (node.type === "table") {
    return Array.isArray(node.content) && node.content.length > 0;
  }

  if (Array.isArray(node.content)) {
    return node.content.some(nodeHasMeaningfulStructure);
  }

  return false;
}

/**
 * True when rich/plain content has visible text, or structural media
 * (image with usable src, cta/button, non-empty table). Empty paragraph-only docs are false.
 */
export function hasMeaningfulRichText(value: unknown): boolean {
  if (toPlainTextForList(value).trim()) return true;
  if (value == null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const doc = normalizeToTiptapDoc(value);
  return (doc.content || []).some(nodeHasMeaningfulStructure);
}

/**
 * Persist product narrative string fields (shortDesc, longDesc, etc.).
 * Empty TipTap docs / blank plain → ""; TipTap/legacy JSON → sanitized TipTap JSON;
 * plain-text legacy stays trimmed plain so reopen/search stay clean.
 */
export function narrativeRichTextForWrite(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string" && content.trim() === "") return "";
  if (!hasMeaningfulRichText(content)) return "";

  const parsed = typeof content === "string" ? safeJsonParse(content) : content;
  if (isTiptapDoc(parsed) || isLegacyStructuredDoc(parsed)) {
    return sanitizeRichTextForSubmission(content);
  }
  if (typeof content === "string") return content.trim();
  return sanitizeRichTextForSubmission(content);
}
