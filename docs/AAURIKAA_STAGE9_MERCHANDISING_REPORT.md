# AAURIKAA Stage 9 — Merchandising Capability

**Stage:** Merchandising Capability  
**Date:** 2026-08-19  
**Mode:** Inspect inherited ANBAZAR first. Build only genuine SRS gaps. Do not seed AAURIKAA collections, occasions, looks, UGC, or products. Do not invent Wedding/Festive/Party/Everyday taxonomy or merchandising copy. Do not add Instagram/social-feed integration. Do not create a second CMS.

---

## 1. Verdict

ANBAZAR had **no first-class Collection, Occasion, Shop the Look, or Styled by You models**. Existing `Product.tags`, label filters (`new` / `sale` / `deal` / `featured`), category hierarchy, sliders, and static CMS pages do **not** satisfy landing-page content, SEO, ordering, visibility, or dedicated merchandising metadata.

Stage 9 **BUILDS** four separate merchandising entities, reusing:

- Product/SKU identity for associations
- Media/DAM **URLs** (no new upload pipeline)
- Admin auth (`homepage:view` / `homepage:manage`)
- Existing storefront section components (empty until operators publish records)

**Nothing was seeded.** Public lists are empty until Admin authors content and the catalogue supplies product IDs/SKUs.

---

## 2. Requirement matrix

| SRS requirement | Existing ANBAZAR capability / evidence | Classification | Architecture decision | Changes implemented |
|---|---|---|---|---|
| **Collection management** | `Category` is taxonomy, not curated edits. `productLabels` only filters sale/new/featured. Frontend `data/collections.ts` is demo-only. | **BUILD** | Dedicated `MerchCollection` (not Category, not tags, not CMS pages) | Model + Admin `/admin/collections` + public `/api/merchandising/collections` |
| **Occasion management** | SRS lists Wedding/Festive as *typical* examples only. No Occasion model. Frontend `data/occasions.ts` is demo-only. | **BUILD** | Separate `Occasion` model (not a collection `type` flag) | Model + Admin `/admin/occasions` + `/occasions` storefront |
| **Product association** | Product `upsellSkus` / `crossSellSkus` / `boughtTogetherSkus` are PDP cross-sell, not merchandising membership. | **ADAPT** | Ordered `productIds` resolved from ObjectId **or** SKU against existing `Product` | Empty associations allowed; unknown refs rejected |
| **Visibility + display ordering** | Slider `isActive` / `displayOrder` pattern | **REUSE** (pattern) / **BUILD** (entities) | `isActive`, `displayOrder`, plus `showOnHome` for homepage stories/occasions | Public APIs return active rows only |
| **Collection/occasion content + SEO** | Category `title`/`description`; `SiteSettings.seo`; static-page SEO — none of these are collection landings | **BUILD** | `description`, `imageUrl`/`imageAlt`, `seoTitle`, `seoDescription` on Collection and Occasion | Storefront metadata uses these fields |
| **Customer-facing browsing** | `/collections` pages existed on mock data; no `/occasions` | **ADAPT** | Wire listings to merchandising API when `NEXT_PUBLIC_CATALOGUE_SOURCE=api`; mock demo remains local-only | `/collections`, `/collections/[slug]`, `/occasions`, `/occasions/[slug]` |
| **Shop the Look — curated look** | No backend. Frontend `data/looks.ts` demo. | **BUILD** | Separate `ShopLook` | Admin `/admin/looks`; public `/api/merchandising/looks` |
| **Look imagery + mobile imagery** | Slider uploads exist; DAM `Media` exists | **REUSE** (DAM URLs) / **BUILD** (fields) | `imageUrl` + `mobileImageUrl` (no new DAM) | Homepage uses mobile image on small screens |
| **Look title, supporting content, CTA, order, visibility** | — | **BUILD** | `title`, `description`, `ctaLabel`, `ctaHref`, `displayOrder`, `isActive` | Look detail `/looks/[slug]` |
| **Associated products + product links** | PDP related-by-category/tags | **ADAPT** | Ordered product refs; public detail returns published+approved products only | CTA defaults to `/looks/{slug}` when `ctaHref` empty |
| **Styled by You / UGC — curated CMS** | No model. Frontend `data/ugc.ts` demo. Explicitly not a social feed. | **BUILD** | Separate `StyledByYou` | Admin `/admin/ugc`; public `/api/merchandising/ugc` |
| **Image or video, attribution, caption** | `Media.media_type` image/video | **REUSE** (URLs) / **BUILD** (fields) | `mediaType`, `imageUrl`, `videoUrl`, `creatorName`, `caption` | Gallery renders video when `videoUrl` set |
| **Optional external/social link** | — | **BUILD** | `externalUrl` http(s) only — stored URL, not an API | No Instagram/feed client |
| **UGC product association, order, enable/disable, delete** | — | **BUILD** | `productIds`, `displayOrder`, `isActive`, hard delete | Delete removes the record |
| **Jewellery-specific attributes / catalogue seed** | Catalogue not supplied | **HOLD** | Do not invent products or taxonomy | No seeds |
| **Automated Instagram/social integration** | SRS forbids | **HOLD** | Out of scope | Not built |
| **Generic CMS replacement** | Stage 8 static-page CMS | **REUSE** | Merchandising is not CMS pages | Static CMS untouched |
| **Seller / marketplace merchandising** | Marketplace seller surfaces | **HOLD** / excluded | Single-business boundary | No seller picker |

---

## 3. Architecture decision

Four **separate** Mongo models (`MerchCollection`, `Occasion`, `ShopLook`, `StyledByYou`) with a shared CRUD helper for slug, display order, visibility, and Product/SKU resolution. They are **not** folded into `StaticPageContent` or a generic “content block” type.

Media is referenced by **DAM/public URL** (and site-relative paths). Product membership uses existing Product IDs/SKUs and can stay empty until the client catalogue arrives.

Label collections (`new` / `sale` / `featured` via `productLabels.js`) remain listing filters. They are not SRS collections.

---

## 4. APIs / models / Admin / storefront

### Models

- `MerchCollection` — name, slug, description, image, SEO, productIds, isActive, showOnHome, displayOrder  
- `Occasion` — same shape, separate collection  
- `ShopLook` — title, slug, description, image, mobile image, CTA, productIds, isActive, displayOrder  
- `StyledByYou` — image/video, attribution, caption, productIds, externalUrl, isActive, displayOrder  

### Public APIs (`GET`)

- `/api/merchandising/collections` (`?home=true` → `showOnHome`)  
- `/api/merchandising/collections/:slug` (+ published products)  
- `/api/merchandising/occasions` / `:slug`  
- `/api/merchandising/looks` / `:slug`  
- `/api/merchandising/ugc`  

### Admin APIs (`homepage` permission)

- `/api/admin/merchandising/{collections|occasions|looks|ugc}`  
- `GET` / `POST` / `GET:id` / `PUT:id` / `DELETE:id`  

### Admin UI

- `/admin/collections`, `/admin/occasions`, `/admin/looks`, `/admin/ugc`  
- Product IDs/SKUs as comma-separated text (no invented product picker)  
- Image/video as DAM URLs  

### Storefront

When `NEXT_PUBLIC_CATALOGUE_SOURCE=api`, homepage sections and listing pages read the merchandising API and **do not** fall back to demo jewellery edits. Mock merchandising remains only for local demo mode.

---

## 5. Tests executed / results

### Backend

```text
cd backend
npx jest tests/unit/aaurikaaMerchandising.test.js tests/unit/aaurikaaStaticPages.test.js tests/unit/dashboardStatsAccess.test.js tests/utils/productLabels.test.js tests/controllers/adminCustomerEnquiry.test.js --runInBand
```

**Merchandising + Stage 8 static/dashboard:** **3 suites, 21/21 passed** (merchandising 9; static pages 4; dashboard 8).

**Label filters + enquiries:** **2 suites, 12/12 passed** (`productLabels` 6; admin enquiries 6).

### Admin

```text
cd admin
npm test
```

**13/13 passed.**

### Storefront

```text
cd frontend
npm test
```

**26/26 passed.**

---

## 6. Remaining dependencies / HOLDs

| Item | Status |
|---|---|
| Client catalogue (products/SKUs) | **HOLD** — associations work; lists stay empty until IDs/SKUs exist |
| Collection / occasion / look / UGC copy, imagery, taxonomy | **CONFIGURE** — author in Admin; do not invent Wedding/Festive/etc. |
| DAM assets | **CONFIGURE** — paste existing Media public URLs |
| Automated Instagram / social feed | **HOLD** — SRS: curated CMS only |
| Refund policy (SEC-006), Shiprocket production, GSTIN | Unchanged from earlier stages |
| Local demo merchandising (`frontend/src/data/*`) | Remains for `CATALOGUE_SOURCE=mock` only; not loaded into Mongo |

---

## 7. Recommendation for the next stage

**Stop here.** Do not start the next stage automatically.

When ready, prefer:

1. Load the **real AAURIKAA catalogue** (still blocked on the client file), then associate products to collections/occasions/looks.  
2. Author merchandising records in Admin using approved copy and DAM media — still no invented taxonomy.  
3. Keep informational CMS (Stage 8) and merchandising (Stage 9) as separate capabilities.  
4. Refund Policy approval remains the gate for SEC-006.

Git: no operations performed.
