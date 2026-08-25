import { apiRequest, apiRequestBlob, unwrapData } from "./client";
import { ApiError } from "./errors";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function queryString(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "" || value === "all") continue;
    search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export type ImportMode = "create" | "upsert";
export type SpreadsheetFormat = "csv" | "xlsx";
export type ProductExportProfile = "operator" | "full";

export type ImportSummary = {
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  newRecords: number;
  updates: number;
  skipped: number;
};

export type BulkUploadSummary = {
  dryRun?: boolean;
  count?: number;
  batchId?: string;
  summary?: Partial<ImportSummary> & Record<string, unknown>;
  upsert?: { inserted?: number; updated?: number; skipped?: number };
  message?: string;
  validationReport?: {
    contractVersion?: string;
    summary?: Partial<ImportSummary>;
    errors?: unknown[];
    warnings?: unknown[];
    invalidRows?: unknown[];
  };
  errors?: unknown[];
  warnings?: unknown[];
};

export type CategoryImportResult = {
  valid?: boolean;
  validRows?: number;
  totalRows?: number;
  imported?: number;
  failed?: number;
  newRecords?: number;
  updates?: number;
  skipped?: number;
  errors?: unknown[];
  warnings?: unknown[];
};

export type JsonImportResult = {
  inserted?: number;
  skipped?: number;
  failed?: number;
  errors?: Array<{ index?: number; sku?: string; message?: string }>;
};

export type TemplateColumn = {
  key: string;
  required: boolean;
  group: string;
  description: string;
  example: string;
};

export type ImportTemplateSpec = {
  type: string;
  contractVersion: string;
  xlsxImportEnabled: boolean;
  headers: string[];
  required: string[];
  optional: string[];
  columns: TemplateColumn[];
  omittedMarketplaceColumns?: string[];
  notes?: string[];
};

export type CategoryExportProfile = "operator" | "full";

export type CategoryExportQuery = {
  format?: SpreadsheetFormat;
  profile?: CategoryExportProfile;
};

export type ProductExportQuery = {
  format?: SpreadsheetFormat;
  profile?: ProductExportProfile;
  ids?: string;
  skus?: string;
  search?: string;
  sku?: string;
  status?: string;
  tab?: string;
  category?: string;
  subcategory?: string;
  childCategory?: string;
};

export type ImportBatchBreakdown = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

export type ImportBatchListItem = {
  _id: string;
  role?: string;
  productCount?: number;
  status?: string;
  fileName?: string;
  contractVersion?: string;
  importMode?: string;
  createdAt?: string;
  updatedAt?: string;
  breakdown?: ImportBatchBreakdown;
  uploader?: { firstName?: string; lastName?: string };
};

export type ImportBatchProduct = {
  _id: string;
  name?: string;
  sku?: string;
  status?: string;
  importDecision?: string;
  approvalStatus?: string;
  category?: { name?: string };
};

export type ImportBatchDetail = {
  batch: ImportBatchListItem;
  products: ImportBatchProduct[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function apiErrorDetails(err: unknown): Record<string, unknown> {
  if (!(err instanceof ApiError)) return {};
  const body = asRecord(err.details);
  const nested = asRecord(body.details);
  return Object.keys(nested).length ? nested : body;
}

function numberOr(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function summaryFromProductPayload(payload: BulkUploadSummary | Record<string, unknown>): ImportSummary {
  const record = asRecord(payload);
  const report = asRecord(record.validationReport);
  const raw = {
    ...asRecord(record.summary),
    ...asRecord(report.summary),
  };
  const total = numberOr(raw.total ?? record.count, 0);
  const invalid = numberOr(raw.invalid, 0);
  return {
    total,
    valid: numberOr(raw.valid, Math.max(0, total - invalid)),
    invalid,
    warnings: numberOr(raw.warnings, Array.isArray(report.warnings) ? report.warnings.length : 0),
    newRecords: numberOr(raw.newRecords, 0),
    updates: numberOr(raw.updates, 0),
    skipped: numberOr(raw.skipped, 0),
  };
}

export function summaryFromCategoryPayload(payload: CategoryImportResult): ImportSummary {
  const total = numberOr(payload.totalRows, 0);
  const valid = numberOr(payload.validRows, 0);
  const errors = Array.isArray(payload.errors) ? payload.errors.length : 0;
  return {
    total,
    valid,
    invalid: Math.max(errors, total - valid),
    warnings: Array.isArray(payload.warnings) ? payload.warnings.length : 0,
    newRecords: numberOr(payload.newRecords, 0),
    updates: numberOr(payload.updates, 0),
    skipped: numberOr(payload.skipped, 0),
  };
}

function productErrorsFromPayload(payload: BulkUploadSummary | Record<string, unknown>): unknown[] {
  const record = asRecord(payload);
  const report = asRecord(record.validationReport);
  if (Array.isArray(report.errors) && report.errors.length) return report.errors;
  if (Array.isArray(record.errors) && record.errors.length) return record.errors;
  if (Array.isArray(report.invalidRows)) return report.invalidRows;
  return [];
}

function productWarningsFromPayload(payload: BulkUploadSummary | Record<string, unknown>): unknown[] {
  const record = asRecord(payload);
  const report = asRecord(record.validationReport);
  if (Array.isArray(report.warnings)) return report.warnings;
  if (Array.isArray(record.warnings)) return record.warnings;
  return [];
}

export function parseProductValidationError(err: unknown): BulkUploadSummary {
  const details = apiErrorDetails(err);
  const report = asRecord(details.validationReport);
  return {
    dryRun: true,
    summary: asRecord(details.summary).total != null ? asRecord(details.summary) : asRecord(report.summary),
    validationReport: Object.keys(report).length
      ? (report as BulkUploadSummary["validationReport"])
      : {
          summary: asRecord(details.summary),
          errors: Array.isArray(details.errors) ? details.errors : [],
          warnings: Array.isArray(details.warnings) ? details.warnings : [],
          invalidRows: Array.isArray(details.invalidRows) ? details.invalidRows : [],
        },
    errors: productErrorsFromPayload(details),
    warnings: productWarningsFromPayload(details),
    message: err instanceof Error ? err.message : "Validation failed",
  };
}

export function parseCategoryValidationError(err: unknown): CategoryImportResult {
  const details = apiErrorDetails(err);
  return {
    valid: false,
    validRows: numberOr(details.validRows, 0),
    totalRows: numberOr(details.totalRows, 0),
    newRecords: numberOr(details.newRecords, 0),
    updates: numberOr(details.updates, 0),
    skipped: numberOr(details.skipped, 0),
    errors: Array.isArray(details.errors) ? details.errors : [],
    warnings: Array.isArray(details.warnings) ? details.warnings : [],
  };
}

export function collectProductIssues(payload: BulkUploadSummary): unknown[] {
  const reportErrors = productErrorsFromPayload(payload);
  const invalidRows = Array.isArray(payload.validationReport?.invalidRows)
    ? payload.validationReport.invalidRows
    : [];
  return reportErrors.length ? reportErrors : invalidRows;
}

/** GET /api/admin/products/export → spreadsheet download. */
export async function exportAdminProductsCsv(query: ProductExportQuery = {}): Promise<void> {
  const format = query.format ?? "csv";
  const profile = query.profile === "full" ? "full" : "operator";
  const blob = await apiRequestBlob(
    `/api/admin/products/export${queryString({ ...query, format, profile })}`,
  );
  const filenameStem = profile === "full" ? "aaurikaa_products_full_technical" : "aaurikaa_products_catalogue";
  triggerDownload(blob, `${filenameStem}.${format}`);
}

/** GET /api/admin/products/export-json → JSON backup download. */
export async function exportAdminProductsJson(): Promise<void> {
  const blob = await apiRequestBlob("/api/admin/products/export-json");
  triggerDownload(blob, `products_backup_admin_${new Date().toISOString().slice(0, 10)}.json`);
}

export async function fetchProductImportTemplateSpec(): Promise<ImportTemplateSpec> {
  const response = await apiRequest<{ data?: ImportTemplateSpec }>(
    "/api/admin/products/import-template?format=json",
  );
  return unwrapData(response);
}

export async function downloadProductImportTemplate(format: SpreadsheetFormat): Promise<void> {
  const blob = await apiRequestBlob(`/api/admin/products/import-template?format=${format}`);
  triggerDownload(blob, `aaurikaa_product_import_template.${format}`);
}

/** POST /api/admin/products/bulk-upload/validate (field: csvFile). */
export async function validateAdminProductBulkUpload(
  file: File,
  mode: ImportMode = "create",
): Promise<BulkUploadSummary> {
  const body = new FormData();
  body.append("csvFile", file);
  try {
    const response = await apiRequest<{ data?: BulkUploadSummary; message?: string }>(
      `/api/admin/products/bulk-upload/validate?mode=${mode}`,
      { method: "POST", body },
    );
    const data = unwrapData(response);
    return {
      ...data,
      message: response.message,
      errors: productErrorsFromPayload(data),
      warnings: productWarningsFromPayload(data),
    };
  } catch (err) {
    if (err instanceof ApiError && err.kind === "validation") {
      return parseProductValidationError(err);
    }
    throw err;
  }
}

/** POST /api/admin/products/bulk-upload (field: csvFile). */
export async function uploadAdminProductBulk(
  file: File,
  mode: ImportMode = "create",
): Promise<BulkUploadSummary> {
  const body = new FormData();
  body.append("csvFile", file);
  const response = await apiRequest<{ data?: BulkUploadSummary; message?: string }>(
    `/api/admin/products/bulk-upload?mode=${mode}`,
    { method: "POST", body },
  );
  const data = unwrapData(response);
  return { ...data, message: response.message };
}

/** POST /api/admin/products/import-json — restore from exported backup JSON. */
export async function importAdminProductsJson(payload: unknown): Promise<JsonImportResult> {
  const response = await apiRequest<JsonImportResult & { success?: boolean }>(
    "/api/admin/products/import-json",
    { method: "POST", body: payload },
  );
  return {
    inserted: Number(response.inserted) || 0,
    skipped: Number(response.skipped) || 0,
    failed: Number(response.failed) || 0,
    errors: Array.isArray(response.errors) ? response.errors : [],
  };
}

/** GET /api/categories/export → CSV (or xlsx) download. */
export async function exportAdminCategories(query: CategoryExportQuery = {}): Promise<void> {
  const format = query.format ?? "csv";
  const profile = query.profile === "full" ? "full" : "operator";
  const blob = await apiRequestBlob(`/api/categories/export?format=${format}&profile=${profile}`);
  const filenameStem =
    profile === "full" ? "aaurikaa_categories_full_technical" : "aaurikaa_categories_catalogue";
  triggerDownload(blob, `${filenameStem}.${format}`);
}

export async function fetchCategoryImportTemplateSpec(): Promise<ImportTemplateSpec> {
  const response = await apiRequest<{ data?: ImportTemplateSpec }>(
    "/api/categories/import-template?format=json",
  );
  return unwrapData(response);
}

export async function downloadCategoryImportTemplate(format: SpreadsheetFormat): Promise<void> {
  const blob = await apiRequestBlob(`/api/categories/import-template?format=${format}`);
  triggerDownload(blob, `aaurikaa_category_import_template.${format}`);
}

/** POST /api/categories/import/validate (field: csvFile). */
export async function validateAdminCategoryImport(file: File): Promise<CategoryImportResult> {
  const body = new FormData();
  body.append("csvFile", file);
  try {
    const response = await apiRequest<{ data?: CategoryImportResult; message?: string }>(
      "/api/categories/import/validate",
      { method: "POST", body },
    );
    return unwrapData(response) ?? {};
  } catch (err) {
    if (err instanceof ApiError && err.kind === "validation") {
      return parseCategoryValidationError(err);
    }
    throw err;
  }
}

/** POST /api/categories/import (field: csvFile). */
export async function importAdminCategories(file: File): Promise<CategoryImportResult> {
  const body = new FormData();
  body.append("csvFile", file);
  try {
    const response = await apiRequest<{ data?: CategoryImportResult; message?: string }>(
      "/api/categories/import",
      { method: "POST", body },
    );
    return unwrapData(response) ?? {};
  } catch (err) {
    if (err instanceof ApiError && err.kind === "validation") {
      return parseCategoryValidationError(err);
    }
    throw err;
  }
}

export async function fetchImportBatches(): Promise<ImportBatchListItem[]> {
  const response = await apiRequest<{ data?: { batches?: ImportBatchListItem[] } }>(
    "/api/admin/import-batches",
  );
  const data = unwrapData(response);
  return Array.isArray(data?.batches) ? data.batches : [];
}

export async function fetchImportBatch(id: string): Promise<ImportBatchDetail> {
  const response = await apiRequest<{ data?: ImportBatchDetail }>(`/api/admin/import-batches/${id}`);
  return unwrapData(response);
}

export async function approveImportBatch(id: string): Promise<void> {
  await apiRequest(`/api/admin/import-batches/${id}/approve`, { method: "PUT" });
}

export async function rejectImportBatch(id: string): Promise<void> {
  await apiRequest(`/api/admin/import-batches/${id}/reject`, { method: "PUT" });
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text) as unknown;
}

export function downloadTextFile(filename: string, contents: string, type = "text/csv"): void {
  triggerDownload(new Blob([contents], { type }), filename);
}
