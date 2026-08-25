# AAURIKAA ecommerce assembly baseline

## Purpose

This repository is the independent AAURIKAA ecommerce baseline.

It was assembled from approved sources only. It is not a clone, fork, or submodule of IMAGINEAIRY or ANBAZAR.

## Assembly date

2026-08-18

## Sources (file snapshots; no Git history copied)

### Storefront

- Path: `D:\Projects\IMAGINEAIRY_ECOMMERCE\IMAGINEAIRY-SINGLE-VENDOR-ECOMMERCE`
- Copied to: `frontend/`
- Branch: `main`
- Commit: `00c0ab921a90c5c5a1b677472a3a4c4e9c53bae1`

### Admin

- Path: `D:\Projects\IMAGINEAIRY_ECOMMERCE\imagineairy-admin`
- Copied to: `admin/`
- Branch: `update`
- Commit: `10baf128f40fb58fa69dba91bf48a458bba6fc51`

### Backend

- Path: `D:\Projects\aaurikaa-backend`
- Copied to: `backend/`
- Branch: `main`
- Commit: `be3d5ad4b1670e67cc4c353699a7f280e6810cc8`
- Backend itself was previously extracted from ANBAZAR `c6c949a22a1f476530b001c6888b496213570afb`

## Layout

```text
aaurikaa-ecommerce/
├── frontend/   Next.js 16 storefront (mock data)
├── admin/      Next.js 16 admin console (mock data)
├── backend/    Express + Mongoose API
└── docs/
```

Frontend and admin are separate applications. They were not a single repo in the source parent folder.

## Notes left as inherited (not fixed in this assembly)

- Storefront/admin use local mock data. Comments mention a future Laravel API. They do not call the assembled Express backend.
- Storefront/admin have no `.env.example`; they gitignore `.env*`.
- Backend test `tests/utils/keyFeatureCatalogueService.test.js` still reads a former ANBAZAR `frontend/pages/compare.js` path.
- Backend script `scripts/generate-gov2-test-import-csv.js` still writes two directories above `scripts/`.

## Independence

One Git repository exists at the AAURIKAA root. Nested `.git` directories were not copied. No IMAGINEAIRY or ANBAZAR remotes were added.
