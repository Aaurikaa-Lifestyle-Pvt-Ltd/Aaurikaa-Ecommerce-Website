import { StructuredContent } from "@/components/product/structured-content";
import { parseTipTapDoc } from "./tiptap-parse";
import type { TipTapMark, TipTapNode } from "./tiptap-types";

export type { TipTapMark, TipTapNode } from "./tiptap-types";
export { parseTipTapDoc } from "./tiptap-parse";

/**
 * CMS TipTap / structured rich text → React.
 * Reuses product StructuredContent so authored alignment, marks, and blocks
 * match Admin ProductStructuredEditor output without a second renderer.
 * Legacy plain TipTap docs and plain strings remain readable via normalizeToTiptapDoc.
 */
export function TipTapRenderer({ content }: { content: unknown }) {
  return <StructuredContent content={content} className="cms-rich-text w-full space-y-3" />;
}
