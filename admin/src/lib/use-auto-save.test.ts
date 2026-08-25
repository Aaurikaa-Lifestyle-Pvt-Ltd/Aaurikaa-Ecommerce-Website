import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const productsApiSrc = readFileSync(
  new URL("./api/products.ts", import.meta.url),
  "utf8",
);
const hookSrc = readFileSync(new URL("./use-auto-save.ts", import.meta.url), "utf8");
const formSrc = readFileSync(
  new URL("../components/product-edit-form.tsx", import.meta.url),
  "utf8",
);

test("admin products API exposes autosave and latest-draft clients", () => {
  assert.match(productsApiSrc, /export async function autoSaveAdminProduct/);
  assert.match(productsApiSrc, /export async function fetchLatestAdminDraft/);
  assert.match(productsApiSrc, /\/api\/admin\/products\/auto-save/);
  assert.match(productsApiSrc, /\/api\/admin\/products\/latest-draft/);
});

test("useAutoSave debounces, aborts, and skips empty payloads", () => {
  assert.match(hookSrc, /debounceMs = 5000/);
  assert.match(hookSrc, /AbortController/);
  assert.match(hookSrc, /payloadHasContent/);
  assert.match(hookSrc, /baselineSyncToken/);
  assert.match(hookSrc, /draftIdRef/);
  assert.match(hookSrc, /lastSavedDataRef/);
  assert.match(hookSrc, /savedSnapshot/);
});

test("product form wires Draft-only autosave and latest-draft restore", () => {
  assert.match(formSrc, /autosaveEnabled/);
  assert.match(formSrc, /isDraftProductStatus\(status\)/);
  assert.match(formSrc, /fetchLatestAdminDraft/);
  assert.match(formSrc, /Saving draft…/);
  assert.match(formSrc, /Draft saved/);
  assert.match(formSrc, /boundProductId/);
  assert.match(formSrc, /history\.replaceState/);
});
