/**
 * Pure helpers for top-level block manipulation in ProductStructuredEditor.
 * Operates on TipTap doc JSON so existing document structure is preserved.
 */

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";

const BLOCK_COMMANDS = ["up", "down", "duplicate", "delete"] as const;
export type BlockCommand = (typeof BLOCK_COMMANDS)[number];

export function getTopLevelBlockIndex(editor: Editor | null | undefined): number {
  if (!editor?.state?.selection?.$from) return 0;
  return editor.state.selection.$from.index(0);
}

export function transformTopLevelBlocks(
  content: JSONContent[],
  index: number,
  command: string,
): JSONContent[] {
  if (!Array.isArray(content) || content.length === 0) return content;
  if (!BLOCK_COMMANDS.includes(command as BlockCommand)) return content;
  const safeIndex = Math.max(0, Math.min(index, content.length - 1));
  const next = content.map((node) => node);

  if (command === "up") {
    if (safeIndex <= 0) return content;
    const tmp = next[safeIndex - 1];
    next[safeIndex - 1] = next[safeIndex];
    next[safeIndex] = tmp;
    return next;
  }

  if (command === "down") {
    if (safeIndex >= next.length - 1) return content;
    const tmp = next[safeIndex + 1];
    next[safeIndex + 1] = next[safeIndex];
    next[safeIndex] = tmp;
    return next;
  }

  if (command === "duplicate") {
    const copy = JSON.parse(JSON.stringify(next[safeIndex])) as JSONContent;
    next.splice(safeIndex + 1, 0, copy);
    return next;
  }

  if (next.length === 1) {
    return [{ type: "paragraph" }];
  }
  next.splice(safeIndex, 1);
  return next;
}

export function applyTopLevelBlockCommand(editor: Editor | null | undefined, command: string): boolean {
  if (!editor || typeof editor.getJSON !== "function") return false;
  const json = editor.getJSON();
  const content = Array.isArray(json?.content) ? json.content : [];
  if (!content.length) return false;
  const index = getTopLevelBlockIndex(editor);
  const nextContent = transformTopLevelBlocks(content, index, command);
  if (nextContent === content) return false;
  editor.commands.setContent({ type: "doc", content: nextContent }, true);
  editor.commands.focus();
  return true;
}
