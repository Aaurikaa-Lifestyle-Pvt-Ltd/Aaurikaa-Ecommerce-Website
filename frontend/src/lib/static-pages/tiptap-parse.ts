import type { TipTapNode } from "./tiptap-types";

export function parseTipTapDoc(raw: unknown): TipTapNode | null {
  if (!raw) return null;
  let doc: unknown = raw;
  if (typeof raw === "string") {
    try {
      doc = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!doc || typeof doc !== "object") return null;
  const node = doc as TipTapNode;
  if (node.type !== "doc") return null;
  return node;
}
