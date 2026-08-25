import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_TIPTAP_DOC,
  hasMeaningfulRichText,
  isTiptapDoc,
  legacyBlocksToTiptapDoc,
  narrativeRichTextForWrite,
  normalizeToTiptapDoc,
  richTextToPlainText,
  sanitizeHref,
  sanitizeImageSrc,
} from "./rich-text-utils.ts";

test("normalizeToTiptapDoc returns empty doc for empty input", () => {
  assert.deepEqual(normalizeToTiptapDoc(""), EMPTY_TIPTAP_DOC);
  assert.deepEqual(normalizeToTiptapDoc(null), EMPTY_TIPTAP_DOC);
  assert.deepEqual(normalizeToTiptapDoc(undefined), EMPTY_TIPTAP_DOC);
});

test("normalizeToTiptapDoc wraps plain text as a TipTap paragraph", () => {
  const doc = normalizeToTiptapDoc("Pearl studs for everyday wear.");
  assert.equal(doc.type, "doc");
  assert.equal(doc.content?.[0]?.type, "paragraph");
  assert.equal(doc.content?.[0]?.content?.[0]?.text, "Pearl studs for everyday wear.");
});

test("normalizeToTiptapDoc accepts TipTap JSON string", () => {
  const json = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello" }],
      },
    ],
  });
  const doc = normalizeToTiptapDoc(json);
  assert.equal(isTiptapDoc(doc), true);
  assert.equal(doc.content?.[0]?.content?.[0]?.text, "Hello");
});

test("normalizeToTiptapDoc converts legacy blocks", () => {
  const doc = normalizeToTiptapDoc({
    blocks: [
      { type: "heading", level: 2, content: "Title" },
      { type: "paragraph", content: "Body copy" },
    ],
  });
  assert.equal(doc.content?.[0]?.type, "heading");
  assert.equal(doc.content?.[0]?.attrs?.level, 2);
  assert.equal(doc.content?.[1]?.type, "paragraph");
});

test("legacyBlocksToTiptapDoc maps image and button blocks", () => {
  const doc = legacyBlocksToTiptapDoc([
    { type: "image", url: "/media/a.jpg", alt: "A", alignment: "left", size: 50 },
    { type: "button", text: "Shop", link: "/shop", linkType: "internal" },
  ]);
  assert.equal(doc.content?.[0]?.type, "image");
  assert.equal(doc.content?.[0]?.attrs?.src, "/media/a.jpg");
  assert.equal(doc.content?.[1]?.type, "cta");
  assert.equal(doc.content?.[1]?.attrs?.href, "/shop");
});

test("normalizeToTiptapDoc strips HTML tags for plain HTML strings", () => {
  const doc = normalizeToTiptapDoc("<p>Gold <strong>hoops</strong></p>");
  assert.equal(doc.content?.[0]?.content?.[0]?.text, "Gold hoops");
});

test("sanitizeHref allows safe protocols and relative paths", () => {
  assert.equal(sanitizeHref("/products"), "/products");
  assert.equal(sanitizeHref("https://example.com"), "https://example.com");
  assert.equal(sanitizeHref("javascript:alert(1)"), "");
});

test("sanitizeImageSrc rejects unsafe schemes", () => {
  assert.equal(sanitizeImageSrc("/img.png"), "/img.png");
  assert.equal(sanitizeImageSrc("https://cdn.example/a.jpg"), "https://cdn.example/a.jpg");
  assert.equal(sanitizeImageSrc("javascript:alert(1)"), "");
});

test("hasMeaningfulRichText treats empty TipTap docs as empty", () => {
  assert.equal(hasMeaningfulRichText(""), false);
  assert.equal(hasMeaningfulRichText(JSON.stringify(EMPTY_TIPTAP_DOC)), false);
  assert.equal(
    hasMeaningfulRichText(
      JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "  " }] }],
      }),
    ),
    false,
  );
  assert.equal(hasMeaningfulRichText("Pearl studs"), true);
  assert.equal(
    hasMeaningfulRichText(
      JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
      }),
    ),
    true,
  );
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
  assert.equal(
    hasMeaningfulRichText(
      JSON.stringify({
        type: "doc",
        content: [{ type: "cta", attrs: { text: "Shop", href: "/shop" } }],
      }),
    ),
    true,
  );
  assert.equal(
    hasMeaningfulRichText(
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [{ type: "tableCell", content: [{ type: "paragraph" }] }],
              },
            ],
          },
        ],
      }),
    ),
    true,
  );
});

test("narrativeRichTextForWrite persists image-only TipTap docs", () => {
  const imageOnly = JSON.stringify({
    type: "doc",
    content: [{ type: "image", attrs: { src: "/media/care.jpg", alt: "Care" } }],
  });
  const written = narrativeRichTextForWrite(imageOnly);
  assert.notEqual(written, "");
  assert.equal(isTiptapDoc(JSON.parse(written)), true);
  assert.match(written, /\/media\/care\.jpg/);
});

test("narrativeRichTextForWrite clears empty TipTap and keeps plain text", () => {
  assert.equal(narrativeRichTextForWrite(""), "");
  assert.equal(narrativeRichTextForWrite(JSON.stringify(EMPTY_TIPTAP_DOC)), "");
  assert.equal(narrativeRichTextForWrite("  Everyday pearl studs.  "), "Everyday pearl studs.");

  const rich = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Care label" }] }],
  });
  const written = narrativeRichTextForWrite(rich);
  assert.equal(isTiptapDoc(JSON.parse(written)), true);
  assert.match(written, /Care label/);
});

test("narrativeRichTextForWrite persists H2/H3/H4 for save → reopen", () => {
  for (const level of [2, 3, 4]) {
    const source = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level },
          content: [{ type: "text", text: `Heading level ${level}` }],
        },
      ],
    });
    const written = narrativeRichTextForWrite(source);
    const reopened = normalizeToTiptapDoc(written);
    assert.equal(reopened.content?.[0]?.type, "heading");
    assert.equal(reopened.content?.[0]?.attrs?.level, level);
    assert.equal(reopened.content?.[0]?.content?.[0]?.text, `Heading level ${level}`);
  }
});

test("narrativeRichTextForWrite persists bold/italic marks and bullet lists", () => {
  const source = JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bold ", marks: [{ type: "bold" }] },
          { type: "text", text: "and ", marks: [{ type: "italic" }] },
          { type: "text", text: "plain" },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Pearl finish" }],
              },
            ],
          },
        ],
      },
    ],
  });
  const written = narrativeRichTextForWrite(source);
  const reopened = normalizeToTiptapDoc(written);
  const para = reopened.content?.[0];
  assert.equal(para?.type, "paragraph");
  assert.equal(para?.content?.[0]?.marks?.[0]?.type, "bold");
  assert.equal(para?.content?.[1]?.marks?.[0]?.type, "italic");
  assert.equal(reopened.content?.[1]?.type, "bulletList");
  assert.equal(
    reopened.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
    "Pearl finish",
  );
});

test("richTextToPlainText leaves plain strings unchanged and unwraps TipTap", () => {
  assert.equal(richTextToPlainText(""), "");
  assert.equal(richTextToPlainText("  Store dry.  "), "  Store dry.  ");
  assert.equal(richTextToPlainText(JSON.stringify(EMPTY_TIPTAP_DOC)), "");
  assert.equal(
    richTextToPlainText(
      JSON.stringify({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Care" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Keep away from water." }],
          },
        ],
      }),
    ),
    "Care Keep away from water.",
  );
});
