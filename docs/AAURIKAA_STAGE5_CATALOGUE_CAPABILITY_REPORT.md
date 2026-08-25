# AAURIKAA Stage 5 — Catalogue Capability Verification

**Stage:** Catalogue Capability  
**Date:** 2026-08-19  
**Mode:** Inspect existing ANBAZAR-derived catalogue first. Implement only a demonstrated listing-availability gap. No jewellery catalogue seed. No merchandising CMS architecture. No Git operations.

---

## 1. Verdict

The existing product engine already satisfies AAURIKAA SRS catalogue **capability** for Product, Variants, SKU, Media, Product SEO, Categories, product associations, and Import/Export.

**Collections / Occasions** as shoppable destinations are **not** a missing product architecture. Product association can reuse `Product.tags` and listing `?tag=`. Computed “collections” (`new` / `sale` / `deal` / `featured`) already exist. Editorial collection stories, occasion landings, destination SEO, visibility, and ordering are a later merchandising CMS concern — **HOLD** until the client supplies catalogue and content. Tags must not be pretended to be that CMS, and Category/Key Features must not be overloaded for it.

**Inventory** stock fields, variant stock, and order reserve/commit/release already exist (WS2). Manual adjustment ledger with persisted reason remains an operations gap, not a catalogue-engine rebuild.

Storefront catalogue source remains `mock` until real products exist (`NEXT_PUBLIC_CATALOGUE_SOURCE=api`). Admin product writes still omit Seller selection (WS1A).

---

## 2. Requirement matrix

| Requirement | Existing capability / evidence | Classification | Gap | Changes made |
|---|---|---|---|---|
| **Product** | `models/Product.js`: name, slug, prices, status, descriptions, features, Q&A, flags. Admin `POST/PUT /api/admin/products` pins internal Seller. Public `GET /api/products`, slug, taxonomy. | **REUSE** | Admin UI adapter currently sends a subset of fields; backend CRUD is complete. Do not invent jewellery attributes. | None |
| **Variants** | Embedded `variants[]` plus `variantDefinitions`, `variantPricing`, `variantStock`, `variantSku`, `variantMedia`. Dictionary `models/Variant.js` for option names/values. `utils/variantUtils.js` keys (`color:red\|size:large`). Storefront mapper already aligned (WS4). | **REUSE** | Variant quantity lives on Product maps, not a separate SKU collection. That is existing design — keep it. | None |
| **SKU** | Unique product `sku`; unique `variantSku` map; `SkuRule` + `skuGenerator`; admin SKU sync tests. Global uniqueness (fits single store). | **REUSE** | `seller_shop_name` remains a SkuRule segment type internally; do not expose Seller as ownership. | None |
| **Inventory** | `Product.stock` + `variantStock`. WS2 `inventoryLifecycleService` reserve/commit/release/return restore. Cart/checkout use `getVariantStock`. Low-stock seller APIs + dashboard parent `stock <= 10`. | **REUSE** (engine) / **HOLD** (ops ledger) | No persisted stock-adjustment ledger or stored manual-adjust reason. Seller “movements” are sales aggregates. Replacement fulfilment still HOLD. | Listing `inStock` now treats variant quantities (see §3). |
| **Media** | `mainImage` / gallery / `video` + Media IDs; DAM `models/Media.js`; variant media map; R2 storage. | **REUSE** | Configure R2/credentials for production. No catalogue media seeded. | None |
| **SEO** | Product `slug`, `metaTitle`, `metaDescription`, `metaKeywords`, `seo.primaryKeyword`. Import/export round-trip those fields. | **REUSE** (product) / **CONFIGURE** (taxonomy copy) | Category/Sub/Child have `title`, `description`, `slug` — no separate CMS meta fields. Generated blog/career SEO still says Anbazar. Author AAURIKAA titles when content exists. | None |
| **Categories** | Category → Subcategory → ChildCategory; slugs, images, FAQ, `isActive`/`sortOrder` (root), mega menu, tax. Admin `/api/categories`. Public taxonomy + `GET /api/products/category/:slug`. Secondary category paths on Product. Category import/export. | **REUSE** | Do not seed AAURIKAA taxonomy. Admin category adapter today writes name only; backend supports richer fields. | None |
| **Collections / Occasions** | **Association:** `Product.tags[]`, `GET /api/products?tag=`, search entity tags, import `tags` column. **Computed merchandising:** `utils/productLabels.js` `label`/`collection` = new/sale/deal/featured. **Not present:** destination entity with media, visibility, order, content, SEO. Key Feature codes `apparel.occasion` / `design.collection` are apparel leftovers — do not use. | **ADAPT** association via tags; **HOLD** destination CMS | Tags cannot hide/order/SEO a landing independently of product tags. Category must not be used as editorial collections. Do not seed Wedding/Festive/Party/Everyday. | None (no new architecture) |
| **Product associations** | Related: `GET /api/products/related` (category, then tags, then SKU arrays). Explicit `upsellSkus`, `crossSellSkus`, `boughtTogetherSkus` + `GET /api/products/by-skus`. Secondary taxonomy paths. | **REUSE** | Shop the Look / UGC are merchandising, not catalogue SKU links — HOLD next merchandising stage. | None |
| **Import / Export** | Admin `catalog:import` / `export`: CSV contract v2, variants/stock/SKU/media/tags/SEO/associations, JSON backup, `ImportBatch`, governance, XLSX behind `ENABLE_XLSX_IMPORT`. Admin bulk import assigns internal Seller (WS1A). Category import/export. | **REUSE** / **CONFIGURE** | Ready for an eventual AAURIKAA spreadsheet. Do not invent rows. Seller columns in export are leftover; import ignores client sellerId on admin path. | None |

---

## 3. Collections / Occasions decision

SRS needs (1) product association, (2) browse, (3) destination visibility/order/content/SEO.

| Mechanism | Association | Browse | Destination CMS |
|---|---|---|---|
| `Product.tags` + `?tag=` | Yes | Yes | No |
| Labels `new/sale/deal/featured` | Computed | Yes (`?label=`) | No (not editorial) |
| Category tree | Taxonomy only | Yes | Wrong entity |
| Key Features occasion/collection | Apparel codes | No landings | Reject |

**Decision:** Reuse tags for association when the client catalogue arrives (operators may tag products; listing already filters). Do **not** introduce Collection/Occasion models in this stage. First-class destinations belong to merchandising, after real content exists.

---

## 4. Import/Export vs eventual AAURIKAA catalogue

The existing contract already carries identity, taxonomy, prices, stock, variant maps, media URLs, tags, SEO, and association SKUs. That is sufficient to load a future jewellery catalogue **without** a new importer.

Do not enable API catalogue mode or seed products until the client file exists.

---

## 5. Change implemented (minimum genuine gap)

**Issue:** Storefront `inStock=true` used parent `Product.stock` only. After WS2, variant sales decrement `variantStock`. A variant-in-stock product with parent `stock: 0` was hidden from availability filtering (SRS product availability).

**Change:** `buildInStockListingClause()` in `backend/services/search/globalSearchService.js` — in stock if `stock > 0` **or** any `variantStock` value `> 0`.

No new models. No jewellery attributes. No seed data.

---

## 6. Tests executed / results

```text
cd backend
npx jest tests/services/globalSearchService.test.js tests/utils/productTags.test.js tests/utils/productLabels.test.js tests/utils/productExportContract.test.js tests/utils/productImportGovernance.test.js --runInBand
```

**Result:** 5 suites, **46/46 passed**.

Related existing coverage not re-run in this stage: SEC-004 inventory lifecycle, admin product seller resolution, import format parity.

---

## 7. Recommendation for the next stage

**Stop here.** Do not start Shop the Look, UGC, homepage collection stories, or catalogue seeding.

Next workstream should remain whatever the approved roadmap specifies **after** catalogue capability (typically merchandising CMS **or** live catalogue load when the client file arrives). When catalogue arrives: import via existing CSV/XLSX, tag products for occasions/collections, enable `NEXT_PUBLIC_CATALOGUE_SOURCE=api`. Build destination CMS only if the client requires landing pages beyond tag/label browse.

---

## 8. Files changed

| File | Change |
|---|---|
| `backend/services/search/globalSearchService.js` | Variant-aware `inStock` listing clause |
| `backend/tests/services/globalSearchService.test.js` | Clause + listing integration coverage |
| `docs/AAURIKAA_STAGE5_CATALOGUE_CAPABILITY_REPORT.md` | This report |

Git: no operations performed.
