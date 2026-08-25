import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMediaAutosaveSignature } from "./media-autosave.ts";
import type { ProductMediaSlot } from "./mappers/product-write.ts";

test("buildMediaAutosaveSignature changes when a local File is selected (Upload path)", () => {
  const empty = buildMediaAutosaveSignature(undefined, [], undefined);
  const file = {
    name: "ring.jpg",
    size: 2048,
    lastModified: 1700000000000,
  } as File;
  const withFile = buildMediaAutosaveSignature(
    { file } as ProductMediaSlot,
    [],
    undefined,
  );
  assert.notEqual(withFile, empty);
  assert.match(withFile, /file:ring\.jpg:2048:1700000000000/);
});

test("buildMediaAutosaveSignature changes when Gallery URL/mediaId is selected", () => {
  const empty = buildMediaAutosaveSignature(undefined, [], undefined);
  const fromGallery = buildMediaAutosaveSignature(
    { url: "https://cdn.example/main.jpg", mediaId: "media1", file: null },
    [{ url: "https://cdn.example/g1.jpg", mediaId: "media2" }],
    undefined,
  );
  assert.notEqual(fromGallery, empty);
  assert.match(fromGallery, /url:https:\/\/cdn\.example\/main\.jpg:id:media1/);
  assert.match(fromGallery, /url:https:\/\/cdn\.example\/g1\.jpg:id:media2/);
});

test("product form autosave payload includes mediaSignature and strips it before POST", () => {
  const formSrc = readFileSync(
    new URL("../components/product-edit-form.tsx", import.meta.url),
    "utf8",
  );
  assert.match(formSrc, /mediaSignature: buildMediaAutosaveSignature/);
  assert.match(formSrc, /mediaSignature: _mediaSignature/);
});
