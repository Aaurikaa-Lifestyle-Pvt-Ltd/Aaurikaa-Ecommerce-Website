export type ImportIssue = {
  row: number;
  field: string;
  problem: string;
  suggestedFix: string;
};

const FIELD_PATTERNS: Array<{ test: RegExp; field: string }> = [
  { test: /product name|name is required/i, field: "name" },
  { test: /regular price/i, field: "regularPrice" },
  { test: /sale price/i, field: "salePrice" },
  { test: /variantStock|\bstock\b/i, field: "stock" },
  { test: /shipping slab|weightClass|weight class/i, field: "weightClass" },
  { test: /parentSubcategory/i, field: "parentSubcategory" },
  { test: /parentCategory/i, field: "parentCategory" },
  { test: /duplicate .* slug/i, field: "slug" },
  { test: /child category|childCategory/i, field: "childCategory" },
  { test: /subcategory/i, field: "subcategory" },
  { test: /\bcategory\b/i, field: "category" },
  { test: /variantSku|\bsku\b/i, field: "sku" },
  { test: /mainImage|gallery/i, field: "mainImage" },
  { test: /\bvideo\b/i, field: "video" },
  { test: /variant/i, field: "variants" },
  { test: /\bslug\b/i, field: "slug" },
  { test: /\blevel\b/i, field: "level" },
  { test: /\bimage\b/i, field: "image" },
  { test: /returnPolicyMode|returnAllowed/i, field: "returnPolicyMode" },
  { test: /secondaryCategor/i, field: "secondaryCategories" },
  { test: /brand/i, field: "brand" },
];

const FIX_PATTERNS: Array<{ test: RegExp; fix: string }> = [
  { test: /parentCategory is required/i, fix: "Add the parent category name/slug, and include that parent row above this one." },
  { test: /parentSubcategory is required/i, fix: "Add the parent subcategory name/slug, and include that parent row above this one." },
  { test: /Shipping Slab is required/i, fix: "Enter an existing Shipping Slab name from Admin → Shipping (e.g. No Shipping Charge (₹0/-))." },
  { test: /Shipping Slab name not found/i, fix: "Use an exact Shipping Slab name from Admin → Shipping. Template default: No Shipping Charge (₹0/-). Do not use Standard." },
  { test: /Shipping Slab name is ambiguous/i, fix: "More than one slab shares that name. Use the WeightClass ID from Admin → Shipping instead." },
  { test: /Shipping Slab is inactive/i, fix: "Activate that Shipping Slab in Admin → Shipping, or pick an active slab name." },
  { test: /Shipping Slab (ID is invalid|is invalid)/i, fix: "Use a valid Shipping Slab name or ID from Admin → Shipping." },
  { test: /is required/i, fix: "Fill this required column. See the template Instructions sheet." },
  { test: /already exists in the database/i, fix: "Use a new SKU, or choose “Update existing products” to change this one." },
  { test: /duplicated in the upload file|duplicate SKU/i, fix: "Each SKU in the file must be unique. Remove or rename the duplicate." },
  { test: /not found/i, fix: "Use an existing name or slug. Import categories first if this hierarchy is new." },
  { test: /invalid level/i, fix: "Use category, subcategory, or childCategory." },
  { test: /must be a valid http/i, fix: "Use a full http(s) URL, not a local file path." },
  { test: /variantStock missing/i, fix: "Add stock for every variant combination in variantStock JSON." },
  { test: /variantSku missing/i, fix: "Add a SKU for every variant combination in variantSku JSON." },
  { test: /no valid combinations/i, fix: "Check variants JSON: each type needs a name and at least one value." },
  { test: /must be a number >= 0|must be > 0|positive/i, fix: "Enter a valid number. Prices must be greater than 0; stock can be 0." },
  { test: /duplicate .* slug/i, fix: "Change the slug so it is unique under that parent." },
  { test: /empty import file|no product rows|no data/i, fix: "Add at least one data row under the header row." },
  { test: /unsupported file type|xlsx import is disabled/i, fix: "Upload CSV. Excel import is only available when enabled on the server." },
];

export function guessField(message: string): string {
  for (const entry of FIELD_PATTERNS) {
    if (entry.test.test(message)) return entry.field;
  }
  return "—";
}

export function suggestedFixFor(message: string): string {
  for (const entry of FIX_PATTERNS) {
    if (entry.test.test(message)) return entry.fix;
  }
  return "Correct this value using the template column description, then validate again.";
}

export function parseRowPrefix(message: string): { row: number; rest: string } {
  const match = String(message).trim().match(/^Row\s+(\d+)\s*:\s*(.*)$/i);
  if (match) {
    return { row: Number(match[1]), rest: match[2] };
  }
  return { row: 0, rest: String(message).trim() };
}

export function issueFromMessage(message: string, fallbackRow = 0): ImportIssue {
  const parsed = parseRowPrefix(message);
  const problem = parsed.rest || String(message).trim();
  return {
    row: parsed.row || fallbackRow,
    field: guessField(problem),
    problem,
    suggestedFix: suggestedFixFor(problem),
  };
}

export function issuesFromUnknown(errors: unknown): ImportIssue[] {
  if (!Array.isArray(errors)) return [];
  const issues: ImportIssue[] = [];
  for (const item of errors) {
    if (typeof item === "string") {
      issues.push(issueFromMessage(item));
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const message = String(record.message ?? record.error ?? "").trim();
      const nested = record.errors;
      if (Array.isArray(nested) && nested.length) {
        const row = Number(record.rowIndex ?? record.row) || 0;
        for (const child of nested) {
          if (typeof child === "string") {
            const parsed = issueFromMessage(child, row);
            issues.push(row && !parsed.row ? { ...parsed, row } : parsed);
          }
        }
        continue;
      }
      if (message) {
        const row = Number(record.row ?? record.rowIndex) || 0;
        const parsed = issueFromMessage(message, row);
        issues.push({ ...parsed, row: parsed.row || row });
      }
    }
  }
  return issues;
}

export function errorReportCsv(issues: ImportIssue[]): string {
  const header = "Row,Field,Problem,Suggested Fix";
  const lines = issues.map((issue) =>
    [issue.row || "", issue.field, issue.problem, issue.suggestedFix]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...lines].join("\n");
}
