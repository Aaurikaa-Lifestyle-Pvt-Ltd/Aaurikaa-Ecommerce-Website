# AAURIKAA backend baseline

## Source

ANBAZAR ecommerce backend (`Anbazar Ecommerce Website/backend`), extracted as a file snapshot only. No Git history, remotes, or upstream tracking were copied from ANBAZAR.

Source commit observed at extraction (ANBAZAR was not modified):

- Repository: `Fashionhaven76/Anbazar-Ecommerce-Website`
- Branch: `Product-Identity-SKU-Media-and-Bulk-Catalogue-Management`
- Commit: `c6c949a22a1f476530b001c6888b496213570afb`

## Purpose

This repository is the AAURIKAA backend baseline. It exists so AAURIKAA can evolve independently of ANBAZAR.

## Extraction date

2026-08-18

## Technology stack

- Node.js + Express
- MongoDB via Mongoose
- JWT authentication
- Jest + Supertest (tests)
- Cloudflare R2 (`@aws-sdk/client-s3`) for object storage
- PhonePe Standard Checkout V2
- Shiprocket fulfillment
- Nodemailer SMTP
- node-cron background jobs

## Major inherited modules

- Auth and roles: shopper, seller, admin (including RBAC / permission enforcement)
- Catalogue: products, categories, subcategories, child categories, brands, variants, SKU rules, key-feature catalogue, bulk import/export
- Orders, payments, invoices, coupons, pricing, tax, shipping
- After-sales: returns, refunds, wallet, SLA jobs
- CMS / static pages, blogs, careers, enquiries, newsletters
- Media uploads and R2 migration scripts
- Seller payouts, commissions, ledgers, pickup locations

## Architectural notes

- Entry point: `server.js` (`npm start` / `npm run dev`).
- Models are registered via `models/index.js`.
- Admin UI is not in this repository. ANBAZAR’s admin lives in the Next.js frontend; this backend only provides `/api/admin/*` and related APIs.
- Runtime code does not import frontend files. One inherited test (`tests/utils/keyFeatureCatalogueService.test.js`) reads `frontend/pages/compare.js` from the old monorepo layout and is expected to fail after extraction.
- `scripts/generate-gov2-test-import-csv.js` writes a CSV two directories above `scripts/` (old monorepo root). That path is inherited and unused at runtime.
- `lib/db.js` and `mongoose` are leftover snippets; the live connection is in `server.js` (`MONGODB_URI`).
- `.env.example` was sanitized on extraction: ANBAZAR’s tracked example contained live Shiprocket credentials. This copy keeps variable names only.

## Independence

This AAURIKAA repository is independent from ANBAZAR. It has its own Git history and remotes. It is not a fork, clone, or submodule of ANBAZAR.
