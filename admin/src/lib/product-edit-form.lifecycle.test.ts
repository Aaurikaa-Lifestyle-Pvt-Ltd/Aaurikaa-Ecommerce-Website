import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const formSrc = readFileSync(
  new URL("../components/product-edit-form.tsx", import.meta.url),
  "utf8",
);
const contentEditorSrc = readFileSync(
  new URL("../components/structured-editor.tsx", import.meta.url),
  "utf8",
);
const structuredEditorSrc = readFileSync(
  new URL("../components/product-structured-editor.tsx", import.meta.url),
  "utf8",
);

test("product edit form uses lifecycle write helpers instead of status dropdown", () => {
  assert.match(formSrc, /resolveLifecycleWriteStatus/);
  assert.match(formSrc, /requireWeightClassForPublish/);
  assert.match(formSrc, /handleLifecycleSave\("publish"\)/);
  assert.match(formSrc, /handleLifecycleSave\("unpublish"\)/);
  assert.match(formSrc, /handleLifecycleSave\("save"\)/);
  assert.doesNotMatch(formSrc, /<option>Inactive<\/option>/);
  assert.doesNotMatch(formSrc, /<option>Archived<\/option>/);
  assert.doesNotMatch(formSrc, /toBackendProductStatus\(status\)/);
});

test("product edit form uses regularPrice for List Price and salePrice for Sale Price", () => {
  assert.match(formSrc, /product\?\.regularPrice && product\.regularPrice > 0/);
  assert.match(formSrc, /product\?\.salePrice && product\.salePrice > 0/);
});

test("product edit form uses longDesc Structured Editor, shipping slab, and draft autosave", () => {
  assert.match(formSrc, /ProductContentEditor/);
  assert.match(formSrc, /Shipping slab/);
  assert.match(formSrc, /Used at checkout to calculate shipping/);
  assert.match(formSrc, /autoSaveAdminProduct/);
  assert.match(formSrc, /fetchLatestAdminDraft/);
  assert.match(formSrc, /useAutoSave/);
  assert.doesNotMatch(formSrc, /Short description/);
  assert.doesNotMatch(formSrc, /setShortDescription/);
  assert.doesNotMatch(formSrc, /primaryKeyword\.trim\(\) \|\| name/);
  assert.match(formSrc, /Weight \(grams\)/);
  assert.match(formSrc, /Leave blank to auto-generate/);
  assert.doesNotMatch(formSrc, /Seller ownership/);
  assert.doesNotMatch(formSrc, /variant engine/);
});

test("autosave promotes create draft in-place without remounting (keeps Care/Media/FAQ)", () => {
  assert.match(formSrc, /boundProductId/);
  assert.match(formSrc, /isUnboundCreate/);
  assert.match(formSrc, /resolveMediaSlotForAutosave/);
  assert.match(formSrc, /uploadAdminMedia/);
  assert.match(formSrc, /buildMediaAutosaveSignature/);
  assert.match(formSrc, /mediaSignature: buildMediaAutosaveSignature/);
  assert.match(formSrc, /boundProductIdRef/);
  assert.match(formSrc, /savedSnapshot/);
  assert.match(
    formSrc,
    /const onAutosaveSuccess = useCallback\([\s\S]*?history\.replaceState[\s\S]*?\[isCreateMode, boundProductId\]/,
  );
  assert.doesNotMatch(
    formSrc,
    /const onAutosaveSuccess = useCallback\([\s\S]*?router\.replace[\s\S]*?\[isCreateMode, boundProductId\]/,
  );
});

test("PRODUCT structured editor flushes TipTap JSON on unmount", () => {
  assert.match(structuredEditorSrc, /Flush pending TipTap JSON before unmount/);
  assert.match(structuredEditorSrc, /editorInstanceRef/);
  assert.match(structuredEditorSrc, /onChangeRef/);
});

test("publish requires weightClass; save published stays published", () => {
  assert.match(formSrc, /action === "publish"/);
  assert.match(formSrc, /requireWeightClassForPublish\(weightClassId\)/);
  assert.match(formSrc, /resolveLifecycleWriteStatus\(status, action\)/);
});

test("ProductContentEditor keeps TipTap for Description + Care + Manufacturer only", () => {
  assert.match(contentEditorSrc, /title="Product Description"/);
  assert.match(contentEditorSrc, /title="Manufacturer Details"/);
  assert.match(contentEditorSrc, /ProductStructuredEditor/);
  assert.doesNotMatch(contentEditorSrc, /Short description/);
  assert.doesNotMatch(contentEditorSrc, /product-length|product-material|Net Weight|Net Quantity/);
  assert.doesNotMatch(contentEditorSrc, /Features narrative|product-features-narrative/);
  assert.doesNotMatch(contentEditorSrc, /Country of Origin/);
  assert.doesNotMatch(contentEditorSrc, /Marketed By/);
  assert.doesNotMatch(contentEditorSrc, /Grievance Redressal/);
});

test("PRODUCT structured editor toolbar offers H2–H4 only", () => {
  assert.match(structuredEditorSrc, /PRODUCT_HEADING_LEVELS/);
  assert.match(structuredEditorSrc, /context === "PRODUCT"/);
  assert.match(structuredEditorSrc, /Heading 2/);
  assert.match(structuredEditorSrc, /Heading 4/);
  assert.match(structuredEditorSrc, /context !== "PRODUCT"/);
});
