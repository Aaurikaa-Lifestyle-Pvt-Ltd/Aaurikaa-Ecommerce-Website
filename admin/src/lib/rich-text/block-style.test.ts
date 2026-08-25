/**
 * TipTap heading level → document JSON (ANBAZAR StructuredEditor heading tests port).
 * Uses jsdom so @tiptap/core Editor can run under node:test.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { applyEditorBlockStyle } from "./block-style.ts";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
Object.defineProperty(globalThis, "window", { value: window, configurable: true });
Object.defineProperty(globalThis, "document", { value: window.document, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", {
  value: window.HTMLElement,
  configurable: true,
});
Object.defineProperty(globalThis, "DocumentFragment", {
  value: window.DocumentFragment,
  configurable: true,
});
Object.defineProperty(globalThis, "MutationObserver", {
  value: window.MutationObserver,
  configurable: true,
});
Object.defineProperty(globalThis, "getComputedStyle", {
  value: window.getComputedStyle.bind(window),
  configurable: true,
});
try {
  Object.defineProperty(globalThis, "navigator", {
    value: window.navigator,
    configurable: true,
  });
} catch {
  /* Node 22+ may already define navigator as a getter */
}
Object.defineProperty(globalThis, "requestAnimationFrame", {
  value: (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0),
  configurable: true,
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  value: (id: number) => clearTimeout(id),
  configurable: true,
});

function paragraphDoc(text: string) {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function createEditor(content: object) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
    ],
    content,
  });
}

test("applyEditorBlockStyle sets H2 / H3 / H4 in TipTap JSON", () => {
  for (const level of [2, 3, 4] as const) {
    const editor = createEditor(paragraphDoc(`Make me H${level}`));
    assert.equal(applyEditorBlockStyle(editor, String(level)), true);
    const json = editor.getJSON();
    assert.equal(json.content?.[0]?.type, "heading");
    assert.equal(json.content?.[0]?.attrs?.level, level);
    editor.destroy();
  }
});

test("applyEditorBlockStyle switches heading back to paragraph", () => {
  const editor = createEditor({
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Was a heading" }],
      },
    ],
  });
  assert.equal(applyEditorBlockStyle(editor, "p"), true);
  const json = editor.getJSON();
  assert.equal(json.content?.[0]?.type, "paragraph");
  assert.equal(json.content?.[0]?.content?.[0]?.text, "Was a heading");
  editor.destroy();
});

test("ProductStructuredEditor select does not preventDefault on mousedown", () => {
  const src = readFileSync(
    new URL("../../components/product-structured-editor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /Do NOT preventDefault on mousedown/);
  assert.match(src, /applyEditorBlockStyle\(editor, e\.target\.value\)/);
  // Sync must skip while focused (debounce race / heading revert).
  assert.match(src, /if \(editor\.isFocused\) return/);
  assert.match(src, /lastEmittedRef/);
  // debounceMs prop retained for tests / callers (0 = immediate emit).
  assert.match(src, /debounceMs = 250/);
});
