/** Minimal TipTap doc helpers for Admin CMS (no TipTap package). */

export const EMPTY_TIPTAP_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }],
} as const;

export function plainTextToTiptapJson(text: string): string {
  const paragraphs = String(text || "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    return JSON.stringify(EMPTY_TIPTAP_DOC);
  }

  return JSON.stringify({
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph.replace(/\n/g, " ") }],
    })),
  });
}

function isTiptapDoc(value: unknown): value is { type: string; content?: unknown[] } {
  return Boolean(value && typeof value === "object" && (value as { type?: string }).type === "doc");
}

/** Extract simple paragraph text when possible; otherwise return JSON for advanced docs. */
export function tiptapValueToEditableText(value: unknown): string {
  if (value == null || value === "") {
    return "";
  }

  let doc: unknown = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try {
      doc = JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  if (!isTiptapDoc(doc) || !Array.isArray(doc.content)) {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  const paragraphs: string[] = [];
  for (const node of doc.content) {
    if (!node || typeof node !== "object") {
      return typeof value === "string" ? value : JSON.stringify(doc, null, 2);
    }
    const n = node as { type?: string; content?: Array<{ type?: string; text?: string }> };
    if (n.type !== "paragraph") {
      return typeof value === "string" ? value : JSON.stringify(doc, null, 2);
    }
    if (!n.content?.length) {
      paragraphs.push("");
      continue;
    }
    if (n.content.some((c) => c.type !== "text" || typeof c.text !== "string")) {
      return typeof value === "string" ? value : JSON.stringify(doc, null, 2);
    }
    paragraphs.push(n.content.map((c) => c.text ?? "").join(""));
  }

  return paragraphs.join("\n\n");
}

/**
 * Coerce zone/body values (JSON string or TipTap object) into the string
 * ProductStructuredEditor expects — without flattening rich formatting.
 */
export function richTextValueToEditorString(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * Accept TipTap JSON (string or object) or plain text.
 * Plain / invalid JSON is wrapped into a TipTap paragraph doc for backend validation.
 */
export function editableTextToTiptapJson(text: string): string {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) {
    return JSON.stringify(EMPTY_TIPTAP_DOC);
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isTiptapDoc(parsed)) {
        return JSON.stringify(parsed);
      }
    } catch {
      /* fall through to plain wrap */
    }
  }

  return plainTextToTiptapJson(text);
}
