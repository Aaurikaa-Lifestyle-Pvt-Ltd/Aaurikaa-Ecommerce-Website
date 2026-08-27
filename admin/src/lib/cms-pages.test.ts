import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { isMarketplaceCmsPageKey } from "./cms-pages.ts";
import {
  editableTextToTiptapJson,
  plainTextToTiptapJson,
  richTextValueToEditorString,
  tiptapValueToEditableText,
} from "./tiptap-plain.ts";

test("marketplace CMS keys are identified and excluded from Admin CMS source", () => {
  assert.equal(isMarketplaceCmsPageKey("become-seller"), true);
  assert.equal(isMarketplaceCmsPageKey("faq"), false);

  const cmsDir = path.join(import.meta.dirname, "../app/admin/cms");
  const files = fs.readdirSync(cmsDir, { recursive: true }) as string[];
  const cmsSource = files
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => fs.readFileSync(path.join(cmsDir, name), "utf8"))
    .join("\n");
  const structured = fs.readFileSync(
    path.join(import.meta.dirname, "../components/structured-editor.tsx"),
    "utf8",
  );

  assert.equal(cmsSource.includes("isMarketplaceCmsPageKey"), true);
  assert.equal(/sellerId/.test(cmsSource), false);
  assert.equal(cmsSource.includes("StructuredEditor"), true);
  assert.equal(cmsSource.includes('value="trashed"'), true);
  assert.equal(structured.includes("sectionList"), true);
  assert.equal(structured.includes("contactCard"), true);
  assert.equal(structured.includes("ctaCard"), true);
  assert.equal(structured.includes("supportPanel"), true);
  assert.equal(structured.includes("heroBanner"), true);
  assert.equal(structured.includes("orderedSections"), true);
  assert.equal(structured.includes("CmsMediaField") || structured.includes("cms-zone-editors"), true);
  assert.equal(structured.includes("ProductStructuredEditor"), true);
  assert.equal(structured.includes('context="CMS"'), true);
  assert.equal(/TipTap JSON|JSON from the existing manifest|raw JSON/i.test(structured), false);
  assert.equal(structured.includes("Advanced content"), true);

  const zoneEditors = fs.readFileSync(
    path.join(import.meta.dirname, "../components/cms-zone-editors.tsx"),
    "utf8",
  );
  assert.equal(zoneEditors.includes("MediaPicker") || zoneEditors.includes("CmsMediaField"), true);
  assert.equal(zoneEditors.includes("OrderedSectionsEditor"), true);
  assert.equal(zoneEditors.includes("pruneOrderedSections"), true);
  assert.equal(zoneEditors.includes("ProductStructuredEditor"), true);
  assert.equal(zoneEditors.includes("tiptapValueToEditableText"), false);

  const orderedLib = fs.readFileSync(
    path.join(import.meta.dirname, "cms-ordered-sections.ts"),
    "utf8",
  );
  assert.equal(orderedLib.includes("pruneOrderedSections"), true);
});

test("settings UI is account-only and does not expose store website forms", () => {
  const settings = fs.readFileSync(
    path.join(import.meta.dirname, "../app/admin/settings/page.tsx"),
    "utf8",
  );
  assert.equal(/bestSellerSellerId|Select seller|sellerId/i.test(settings), false);
  assert.equal(/29A[A-Z]{5}/.test(settings), false);
  assert.equal(settings.includes("fetchAdminMe"), true);
  assert.equal(settings.includes("changeAdminPassword"), true);
  assert.equal(settings.includes("workingHours1"), false);
  assert.equal(settings.includes("fetchHeader"), false);
  assert.equal(settings.includes("Footer columns"), false);
});

test("settings API still exposes SEO and site helpers for other hubs", () => {
  const api = fs.readFileSync(path.join(import.meta.dirname, "api/settings.ts"), "utf8");
  assert.equal(api.includes("fetchHeader"), true);
  assert.equal(api.includes("updateHeader"), true);
  assert.equal(api.includes("/api/settings/header"), true);
  assert.equal(api.includes("FooterColumn"), true);
  assert.equal(api.includes("fetchSeoSettings"), true);
  assert.equal(api.includes("workingHours1"), true);
});

test("staff permission catalog keeps cms and site_settings visible", () => {
  const staffCatalog = fs.readFileSync(
    path.join(import.meta.dirname, "staff-catalog.ts"),
    "utf8",
  );
  assert.equal(staffCatalog.includes('"sellers"'), true);
  assert.equal(staffCatalog.includes('"finance"'), true);
  assert.equal(/HIDDEN_STAFF_DOMAINS[\s\S]*cms/.test(staffCatalog), false);
  assert.equal(/HIDDEN_STAFF_DOMAINS[\s\S]*site_settings/.test(staffCatalog), false);
});

test("staff page allows editing permissions for non-super-admin users", () => {
  const staffPage = fs.readFileSync(
    path.join(import.meta.dirname, "../app/admin/staff/page.tsx"),
    "utf8",
  );
  assert.equal(staffPage.includes("updateStaffUser"), true);
  assert.equal(staffPage.includes("Save permissions"), true);
  assert.equal(staffPage.includes("PermissionPicker"), true);
});

test("tiptap plain helpers wrap and round-trip simple paragraphs", () => {
  const wrapped = plainTextToTiptapJson("Hello\n\nWorld");
  const parsed = JSON.parse(wrapped);
  assert.equal(parsed.type, "doc");
  assert.equal(parsed.content.length, 2);
  assert.equal(tiptapValueToEditableText(wrapped), "Hello\n\nWorld");
  assert.equal(JSON.parse(editableTextToTiptapJson("Plain")).type, "doc");
  assert.equal(JSON.parse(editableTextToTiptapJson(wrapped)).content.length, 2);
  assert.equal(richTextValueToEditorString(parsed), wrapped);
  assert.equal(richTextValueToEditorString(wrapped), wrapped);
  assert.equal(richTextValueToEditorString(null), "");
});
