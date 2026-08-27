import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");

function collectSource(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    if (entry.name.endsWith(".test.ts")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSource(full, acc);
    else if (/\.(ts|tsx|js|mjs|env\.example)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

test("admin source does not embed secrets or demo passwords", () => {
  const files = collectSource(path.join(ROOT, "src")).concat(
    path.join(ROOT, ".env.example"),
  );
  const forbidden = [
    /JWT_SECRET\s*=\s*[^\n\s]/,
    /PHONEPE_CLIENT_SECRET/,
    /SHIPROCKET_PASSWORD/,
    /MONGODB_URI\s*=\s*mongodb/,
    /CLOUDFLARE_R2_SECRET/,
    /demo1234/,
    /admin@imagineairy\.demo/,
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.equal(pattern.test(text), false, `${file} matched ${pattern}`);
    }
  }
});

test("admin product create UI does not expose seller selection", () => {
  const page = fs.readFileSync(
    path.join(ROOT, "src/app/admin/products/page.tsx"),
    "utf8",
  );
  const detail = fs.readFileSync(
    path.join(ROOT, "src/app/admin/products/[id]/page.tsx"),
    "utf8",
  );
  const create = fs.readFileSync(
    path.join(ROOT, "src/app/admin/products/new/page.tsx"),
    "utf8",
  );
  const form = fs.readFileSync(
    path.join(ROOT, "src/components/product-edit-form.tsx"),
    "utf8",
  );
  assert.equal(/sellerId|Seller ownership picker|Select seller/i.test(page), false);
  assert.equal(/sellerId/.test(detail), false);
  assert.equal(/sellerId|Select seller/i.test(create), false);
  assert.equal(/sellerId|Select seller|Seller ownership picker/i.test(form), false);
  assert.equal(page.includes("/admin/products/new"), true);
  assert.equal(/Save draft & edit|showAdd/.test(page), false);
});

test("catalogue import UI does not expose seller picker", () => {
  const page = fs.readFileSync(
    path.join(ROOT, "src/app/admin/catalogue-import/page.tsx"),
    "utf8",
  );
  const product = fs.readFileSync(
    path.join(ROOT, "src/app/admin/catalogue-import/product-panel.tsx"),
    "utf8",
  );
  const category = fs.readFileSync(
    path.join(ROOT, "src/app/admin/catalogue-import/category-panel.tsx"),
    "utf8",
  );
  const source = `${page}\n${product}\n${category}`;
  assert.equal(/sellerId|Select seller/i.test(source), false);
  assert.equal(source.includes("Confirm import"), true);
  assert.equal(source.includes("Download CSV template"), true);
});

test("staff permission UI source hides marketplace seller domain assignment", () => {
  const staffApi = fs.readFileSync(
    path.join(ROOT, "src/lib/api/staff.ts"),
    "utf8",
  );
  const staffCatalog = fs.readFileSync(
    path.join(ROOT, "src/lib/staff-catalog.ts"),
    "utf8",
  );
  assert.equal(staffApi.includes("HIDDEN_STAFF_DOMAINS"), true);
  assert.equal(staffApi.includes("shapePermissionCatalogForAaurikaa"), true);
  assert.equal(staffCatalog.includes("HIDDEN_STAFF_DOMAINS"), true);
  assert.equal(staffCatalog.includes('"sellers"'), true);
  assert.equal(staffCatalog.includes('"finance"'), true);
});

test("merchandising admin does not expose seller selection or jewellery taxonomy seeds", () => {
  const files = [
    "src/app/admin/collections/page.tsx",
    "src/app/admin/occasions/page.tsx",
    "src/app/admin/looks/page.tsx",
    "src/app/admin/ugc/page.tsx",
    "src/components/merchandising-editor.tsx",
  ].map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"));
  const source = files.join("\n");
  assert.equal(/sellerId|Select seller/i.test(source), false);
  assert.equal(/instagram|social-feed|Wedding|Festive|Party|Everyday/i.test(source), false);
  assert.equal(source.includes("kind=\"ugc\""), true);
});

test("banners admin keeps slider/offer contracts and fixed homepage slots", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/banners/page.tsx"), "utf8");
  const api = fs.readFileSync(path.join(ROOT, "src/lib/api/promotions.ts"), "utf8");
  assert.equal(/sellerId|Select seller|Wedding|Festive/i.test(page), false);
  assert.match(api, /\/api\/sliders/);
  assert.match(api, /\/api\/admin\/offers/);
  assert.match(api, /BANNER_SLOTS/);
  assert.match(api, /placement/);
  assert.match(api, /mobileImage/);
  assert.match(api, /displayOrder/);
  assert.match(api, /updateAdminOffer/);
  assert.match(api, /label: "Hero"/);
  assert.match(api, /Promotional 1/);
  assert.match(api, /Promotional 2/);
  assert.match(page, /EmptyState/);
  assert.match(page, /offersQuery\.error/);
  assert.match(page, /BANNER_SLOTS/);
  assert.match(page, /fetchAdminOffers\("announcement"\)/);
  assert.match(page, /updateAdminOffer/);
  assert.match(page, /mobileImageFile/);
  assert.match(page, /Add slide/);
  assert.match(page, /groupSlidersByPlacement/);
});

test("admin nav removes Brands and includes Inventory, Shipping, Account, and Reviews", () => {
  const nav = fs.readFileSync(path.join(ROOT, "src/lib/nav.ts"), "utf8");
  // Brands stays off the sidebar; orphan /admin/brands may still appear in route guards.
  assert.equal(nav.includes('label: "Brands"'), false);
  assert.equal(/adminNav[\s\S]*href:\s*"\/admin\/brands"/.test(nav), false);
  assert.equal(nav.includes('/admin/inventory'), true);
  assert.equal(nav.includes('/admin/shipping'), true);
  assert.equal(nav.includes('label: "Shipping"'), true);
  assert.equal(nav.includes('label: "Account"'), true);
  assert.equal(nav.includes('/admin/reviews'), true);
  assert.equal(nav.includes('label: "Reviews"'), true);
});

test("product form does not load brands or expose Product SEO card", () => {
  const form = fs.readFileSync(path.join(ROOT, "src/components/product-edit-form.tsx"), "utf8");
  const create = fs.readFileSync(path.join(ROOT, "src/app/admin/products/new/page.tsx"), "utf8");
  const detail = fs.readFileSync(path.join(ROOT, "src/app/admin/products/[id]/page.tsx"), "utf8");
  const list = fs.readFileSync(path.join(ROOT, "src/app/admin/products/page.tsx"), "utf8");
  assert.equal(/Brand \(optional\)|fetchActiveAdminBrands|brands\?/i.test(form), false);
  assert.equal(form.includes("Product SEO"), false);
  assert.equal(form.includes("ProductContentEditor"), true);
  assert.equal(form.includes("primaryKeyword"), true);
  assert.equal(create.includes("fetchActiveAdminBrands"), false);
  assert.equal(detail.includes("fetchActiveAdminBrands"), false);
  assert.equal(list.includes("product-approval"), false);
  assert.equal(list.includes("APPROVAL_OPTIONS"), false);
  assert.equal(/Seller ownership/i.test(list), false);
  assert.equal(/Compare-at/i.test(form), false);
  assert.equal(form.includes("Weight (grams)"), true);
});

test("SEO hub covers existing contracts without a second engine", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/seo/page.tsx"), "utf8");
  assert.match(page, /fetchSeoSettings/);
  assert.match(page, /updateAdminProduct/);
  assert.match(page, /updateAdminCategory/);
  assert.match(page, /updateAdminMerch/);
  assert.match(page, /fetchStaticPageRegistry/);
});

test("collections page documents best-sellers hybrid curation", () => {
  const page = fs.readFileSync(
    path.join(ROOT, "src/app/admin/collections/page.tsx"),
    "utf8",
  );
  const editor = fs.readFileSync(
    path.join(ROOT, "src/components/merchandising-editor.tsx"),
    "utf8",
  );
  assert.match(page, /best-sellers/);
  assert.match(page, /sales ranking/);
  assert.match(editor, /sortBy=sales/);
  assert.match(editor, /best-sellers/);
});

test("inventory page and client prefer dedicated API with products fallback", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/inventory/page.tsx"), "utf8");
  const api = fs.readFileSync(path.join(ROOT, "src/lib/api/inventory.ts"), "utf8");
  assert.match(api, /\/api\/admin\/inventory/);
  assert.match(api, /stockEffective/);
  assert.match(api, /params\.set\("stock"/);
  assert.match(api, /params\.set\("search"/);
  assert.match(api, /params\.set\("page"/);
  assert.match(api, /usedProductsFallback/);
  assert.match(page, /fetchAdminInventory/);
  assert.equal(page.includes("warehouse"), false);
  assert.equal(/API is not available yet/i.test(page), false);
});

test("shipping admin is free-threshold only over free-rules API", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/shipping/page.tsx"), "utf8");
  const api = fs.readFileSync(path.join(ROOT, "src/lib/api/shipping.ts"), "utf8");
  assert.match(api, /\/api\/shipping\/free-rules/);
  assert.match(api, /includeInactive/);
  assert.match(api, /minOrderAmountINR/);
  assert.match(page, /fetchFreeShippingRules/);
  assert.match(page, /minOrderAmountINR/);
  assert.equal(page.includes("fetchWeightClasses"), false);
  assert.equal(page.includes("/api/shipping/zones"), false);
  assert.equal(/GSTIN|warehouse/i.test(page), false);
});
