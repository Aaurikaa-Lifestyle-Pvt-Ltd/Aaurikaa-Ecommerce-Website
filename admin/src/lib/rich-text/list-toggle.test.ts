/**
 * TipTap bullet / ordered list toggles → document JSON (StarterKit).
 * Uses jsdom so @tiptap/core Editor can run under node:test.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

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

test("toggleBulletList produces bulletList JSON with StarterKit", () => {
  const editor = createEditor(paragraphDoc("Bullet me"));
  editor.commands.selectAll();
  assert.equal(editor.commands.toggleBulletList(), true);
  const json = editor.getJSON();
  assert.equal(json.content?.[0]?.type, "bulletList");
  assert.equal(json.content?.[0]?.content?.[0]?.type, "listItem");
  assert.equal(
    json.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    "Bullet me",
  );
  editor.destroy();
});

test("toggleOrderedList produces orderedList JSON with StarterKit", () => {
  const editor = createEditor(paragraphDoc("Number me"));
  editor.commands.selectAll();
  assert.equal(editor.commands.toggleOrderedList(), true);
  const json = editor.getJSON();
  assert.equal(json.content?.[0]?.type, "orderedList");
  assert.equal(json.content?.[0]?.content?.[0]?.type, "listItem");
  assert.equal(
    json.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    "Number me",
  );
  editor.destroy();
});
