import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_TIPTAP_DOC,
  hasMeaningfulRichText,
  isTiptapDoc,
  normalizeToTiptapDoc,
  sanitizeHref,
  sanitizeImageSrc,
} from "./rich-text-utils.ts";

test("normalizeToTiptapDoc wraps plain text and accepts TipTap JSON", () => {
  const plain = normalizeToTiptapDoc("Pearl studs for everyday wear.");
  assert.equal(plain.content?.[0]?.content?.[0]?.text, "Pearl studs for everyday wear.");

  const json = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
  });
  const doc = normalizeToTiptapDoc(json);
  assert.equal(isTiptapDoc(doc), true);
  assert.equal(doc.content?.[0]?.content?.[0]?.text, "Hello");
});

test("hasMeaningfulRichText excludes empty TipTap docs", () => {
  assert.equal(hasMeaningfulRichText(""), false);
  assert.equal(hasMeaningfulRichText(JSON.stringify(EMPTY_TIPTAP_DOC)), false);
  assert.equal(hasMeaningfulRichText("Care label"), true);
});

test("hasMeaningfulRichText treats image-only docs as meaningful", () => {
  assert.equal(
    hasMeaningfulRichText(
      JSON.stringify({
        type: "doc",
        content: [{ type: "image", attrs: { src: "/media/pearl.jpg", alt: "Pearl" } }],
      }),
    ),
    true,
  );
  assert.equal(
    hasMeaningfulRichText(
      JSON.stringify({
        type: "doc",
        content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }],
      }),
    ),
    false,
  );
});

test("sanitize helpers reject unsafe schemes", () => {
  assert.equal(sanitizeHref("javascript:alert(1)"), "");
  assert.equal(sanitizeHref("/products"), "/products");
  assert.equal(sanitizeImageSrc("javascript:alert(1)"), "");
  assert.equal(sanitizeImageSrc("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
});
