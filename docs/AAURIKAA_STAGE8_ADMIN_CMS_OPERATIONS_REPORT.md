# AAURIKAA Stage 8 — Admin, CMS & Operational Capability Verification

**Stage:** Admin, CMS & Operational Capability  
**Date:** 2026-08-19  
**Mode:** Inspect inherited ANBAZAR Admin/CMS first. Reuse existing engines. Do not build a parallel CMS. Do not seed AAURIKAA business, legal, GSTIN, shipping, or refund policy content. Do not start Shop the Look, UGC, or catalogue loading.

---

## 1. Verdict

The inherited platform already has a **generic CMS and operational Admin surface** that can satisfy the SRS Admin/CMS scope without a new content architecture.

**Reuse, do not replace:**

- `StaticPageContent` + allowlisted `staticPageRegistry` + per-page manifests (FAQ, About, contact, shipping, returns/refund copy, terms, privacy, help-center, and other informational keys)
- Product SEO fields and `SiteSettings.seo`
- Category `title` / `description` (existing taxonomy content fields)
- Homepage sliders (`Slider`) and announcement `Offer` records
- Customer enquiries, Admin RBAC (`Admin` + permission catalog), SiteSettings, GSTIN/footer fields, shipping-method CRUD, stock-notification requests, dashboard stats

**No new CMS model was created.** AnBazar legal copy is **not** auto-seeded when an Admin opens a missing page. Marketplace seller pages (`become-seller`, `seller-faq`, `seller-help-center`, `seller-terms-condition`, `seller-training`) are hidden in single-store mode.

Genuine Stage 8 work was **wiring AAURIKAA Admin to those APIs** (CMS, banners, enquiries, staff, stock alerts, settings, dashboard KPIs) and enforcing the single-business boundary in CMS listing/public fetch.

**Not started (explicitly out of this stage):** Shop the Look, Styled by You / UGC, Collection/Occasion entities, catalogue seed, Shiprocket production, Refund Policy implementation (SEC-006).

---

## 2. Requirement matrix

| SRS requirement | Existing capability / evidence | Classification | Gap / dependency | Changes implemented |
|---|---|---|---|---|
| **Admin dashboard** | `GET /api/dashboard/stats`; order/product aggregates; low-stock count | **REUSE** / **ADAPT** (UI) | Widgets were thin; Super Admin payload still includes sellers/commission internally | Dashboard KPIs: pending orders, low stock, AWB shipments, returns count. Seller/commission not shown |
| **Product / category / catalogue admin** | Admin product CRUD (internal Seller pinned); categories; variants read; product SEO | **REUSE** / **ADAPT** | Category SEO was not in the form; `title`/`description` already on `Category` | Category edit exposes existing title/description. No seller picker |
| **Homepage / promotional content** | `Slider` CRUD (`/api/sliders`); `Offer` announcements (`/api/admin/offers`); banner settings, 4×4 grid, homepage categories also exist | **REUSE** / **ADAPT** (UI) | Admin banners page was local demo | Banners page uses sliders + offer announcements |
| **Collections / occasions / merchandising** | No Collection/Occasion/Look models | **BUILD** (later) | First-class merchandising entities | **None** — not started |
| **Shop the Look** | None | **BUILD** (later) | Explicitly out of stage | **None** |
| **Styled by You / UGC** | None | **BUILD** (later) | Explicitly out of stage | **None** |
| **CMS pages / website content** | `CmsPage` plus **primary** `StaticPageContent` + manifests | **REUSE** | Admin CMS was a mock hero form | Admin CMS lists/edits static-page registry |
| **FAQ** | `faq` manifest (`faqList` zone) | **REUSE** | AnBazar defaults on first GET | Empty editor; no auto-seed |
| **About / brand** | `about` static page | **REUSE** / **CONFIGURE** | Needs approved AAURIKAA copy | Editor only; no seed |
| **Customer-care content** | `help-center`, `contact`, FAQ | **REUSE** / **CONFIGURE** | Copy not supplied | Editor only |
| **Shipping / returns / refund information** | `shipping-policy`, `returns-refund-policy` | **REUSE** / **HOLD** (refund copy) | Refund policy text must not be invented | Pages exist; remain unpublished until client copy |
| **Terms & Conditions** | `terms-condition` | **REUSE** / **CONFIGURE** | Legal copy not supplied | Editor only |
| **Privacy Policy** | `privacy-policy` | **REUSE** / **CONFIGURE** | Legal copy not supplied | Editor only |
| **SEO management** | `SiteSettings.seo`; product `metaTitle`/`metaDescription`; static-page `seo` | **REUSE** | Category SEO uses existing `title`/`description`, not a separate schema | SEO page already live; CMS page SEO; category title/description |
| **Customer enquiries / support** | `CustomerEnquiry` + `/api/admin/enquiries` | **REUSE** / **ADAPT** (UI) | Not in Admin nav | `/admin/enquiries` list + status handling |
| **Admin users, roles, permissions** | `GET/POST /api/admin/users`, permission catalog, Super Admin chain | **REUSE** / **ADAPT** (UI) | Catalog includes sellers/finance | `/admin/staff`; sellers/finance domains hidden from assignment UI |
| **Store / business settings** | `SiteSettings` site + contact + footer | **REUSE** / **CONFIGURE** | Address/GSTIN empty until supplied | Settings writes existing fields only; no invented GSTIN/address |
| **GST configuration** | GST engine; `footer.gstin`; category `taxRate` | **REUSE** / **CONFIGURE** | Origin still internal Seller state; GSTIN blank | GSTIN field on Settings (empty placeholder). Rates not invented |
| **Shipping configuration** | Zone/slab + `/api/admin/shipping` methods | **REUSE** / **CONFIGURE** | Rules must be approved | Settings lists existing methods; no new invented rules |
| **Payment configuration** | COD + PhonePe env | **CONFIGURE** | Credentials not in Admin | Settings note only; no secret form |
| **Return / replacement / refund policy settings** | Return window on internal Seller; replacement Stage 7; refund wallet inherited | **CONFIGURE** / **HOLD** | Do not invent jewellery return window or refund destination | Settings HOLD copy; CMS for policy text when supplied |
| **Back-in-stock notifications** | `StockNotificationRequest` + product restock hooks | **REUSE** / **ADAPT** (UI) | Meaningful after inventory lifecycle (WS2/Stage 7) | `/admin/stock-alerts` |
| **Admin operational visibility** | Orders, returns, shipments (Stage 7), dashboard | **REUSE** / **ADAPT** | Seller selection must stay hidden | Nav + dashboard; no Seller picker |
| **Static / legal / care storefront pages** | Public `GET /api/static-pages/public?pageKey=` | **REUSE** / **CONFIGURE** | Storefront routes not wired this stage; content unpublished | Public marketplace keys rejected in single-store mode |

---

## 3. CMS architecture decision

The existing **static page registry + manifests + `StaticPageContent.zones`** already covers:

- Static/legal pages  
- FAQ (`faqList`)  
- About/brand  
- Customer-care / help-center  
- Page-level SEO  
- (Homepage promotional content is a **separate** mature module: sliders + offers, not a second CMS)

A new CMS architecture is **not justified**. `CmsPage` (free-form HTML pages) remains available but is not required for the SRS page set.

AnBazar `zoneDefaults` / `seoDefaults` stay in manifests as historical templates. Admin GET of a **missing** page now returns `page: null` + empty zones and **does not persist** those defaults.

---

## 4. Tests executed / results

### Backend

```text
cd backend
npx jest tests/unit/aaurikaaStaticPages.test.js tests/unit/dashboardStatsAccess.test.js tests/controllers/adminCustomerEnquiry.test.js tests/integration/aaurikaa-foundation.test.js --runInBand
```

**Result:** **4 suites, 30/30 passed** (static-page boundary 4; dashboard access 8; enquiries 6; foundation 6).

Also ran `tests/controllers/sliderDisplayOrder.test.js`: **7/9 passed**. Two failures are **pre-existing** (`PUT` displayOrder-only sets `heading` from omitted fields → 500; cache invalidation). Slider controller was not changed this stage.

### Admin

```text
cd admin
npm test
```

**11/11 passed.**

### Storefront

```text
cd frontend
npm test
```

**24/24 passed.**

---

## 5. Configuration / HOLD items

| Item | Status |
|---|---|
| AAURIKAA About, FAQ, care, shipping, T&Cs, privacy copy | **CONFIGURE** — author in CMS when legal/ops supplies it; keep **draft** until approved |
| Returns & refund **policy text** | **HOLD** for refund substance (SEC-006); page key exists |
| GSTIN, legal address, working hours | **CONFIGURE** — empty `SiteSettings.footer` fields; do not invent |
| Return window / `returnAllowed` on internal Seller | **CONFIGURE** — do not invent jewellery-specific days |
| Shipping zone/slab rules | **CONFIGURE** — engine exists; no invented jewellery tariffs |
| PhonePe / COD live credentials | **CONFIGURE** — env, not Admin secrets form |
| Shiprocket production pickup/credentials | **CONFIGURE** — not this stage (Stage 7) |
| Refund processing | **HOLD** — SEC-006 |
| Collection / Occasion / Shop the Look / UGC | **BUILD** — later merchandising workstream |
| Storefront rendering of published static pages | Remaining **ADAPT** (consume existing public API) |
| `PERMISSION_ENFORCEMENT` in production | **CONFIGURE** |
| AnBazar content already in Mongo from old seeds | Ops may leave unpublished; do not republish as AAURIKAA |

---

## 6. Recommendation for the next stage

**Stop here.** Do not begin Stage 9 automatically.

When ready, the next workstream should **not** be a new CMS. Prefer:

1. Author approved informational pages in the **existing** static-page editor (still no invented refund rules).  
2. Optionally wire storefront routes to `GET /api/static-pages/public`.  
3. Then merchandising **BUILD** items (Collections, Occasions, Shop the Look, Styled by You) as a dedicated stage — still not a second CMS platform.  
4. Catalogue load remains blocked on the client file.  
5. Refund Policy approval remains the gate for SEC-006.

---

## 7. Files changed (application)

### Backend

- `config/staticPageRegistry.js` — marketplace page keys  
- `utils/aaurikaaStaticPages.js` — visibility + empty editor zones  
- `controllers/staticPageController.js` — filter registry; no auto-seed; hide marketplace public keys  
- `tests/unit/aaurikaaStaticPages.test.js`

### Admin

- CMS list + `[pageKey]` editor on `/api/admin/static-pages`  
- Banners → sliders + offers  
- Enquiries, staff, stock alerts  
- Settings: address, GSTIN field (empty), enquiry email, shipping method list, payment/policy HOLD notes  
- Dashboard operational KPIs  
- Category title/description  
- Nav; tests for marketplace CMS keys and no Seller/GSTIN invention  

Git: no operations performed.
