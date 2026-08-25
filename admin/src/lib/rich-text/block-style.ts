import type { Editor } from "@tiptap/core";

/**
 * Apply paragraph / heading level from the block-style `<select>` value.
 * PRODUCT toolbar offers H2–H4; levels 1/5/6 remain valid for reopen of legacy content.
 */
export function applyEditorBlockStyle(editor: Editor, value: string): boolean {
  if (value === "p") {
    return editor.chain().focus().setParagraph().run();
  }
  const level = Number(value);
  if (![1, 2, 3, 4, 5, 6].includes(level)) return false;
  return editor
    .chain()
    .focus()
    .setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 })
    .run();
}
