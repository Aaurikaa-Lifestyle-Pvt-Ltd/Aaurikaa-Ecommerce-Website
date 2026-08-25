/**
 * Jewellery catalogue content helpers — reuse existing product fields only.
 * Care = usageSafetyContent via ProductStructuredEditor (TipTap JSON).
 * Manufacturer narrative details use ProductStructuredEditor (TipTap JSON).
 * Legacy scalar manufacturer fields are echoed (not wiped) and can seed details once.
 */

import type { AdminManufacturerConditions } from "@/types/admin";
import { richTextToPlainText } from "./rich-text/rich-text-utils.ts";

function emptyManufacturerConditions(): AdminManufacturerConditions {
  return {
    summary: "",
    details: "",
    countryOfOrigin: "",
    marketedBy: "",
    grievanceRedressal: "",
  };
}

/** Seed TipTap/plain details once from legacy scalars when details is empty. */
export function seedManufacturerDetailsFromLegacy(
  raw: AdminManufacturerConditions,
): string {
  const details = String(raw.details ?? "");
  if (richTextToPlainText(details).trim()) return details.trim();

  const lines: string[] = [];
  const country = String(raw.countryOfOrigin ?? "").trim();
  const marketed = String(raw.marketedBy ?? "").trim();
  const summary = String(raw.summary ?? "").trim();
  const grievance = String(raw.grievanceRedressal ?? "").trim();
  if (country) lines.push(`Country of Origin: ${country}`);
  if (marketed) lines.push(`Marketed By: ${marketed}`);
  if (summary) lines.push(summary);
  if (grievance) lines.push(`Grievance Redressal: ${grievance}`);
  return lines.join("\n\n");
}

/**
 * Normalize manufacturer / compliance fields for Admin edit state.
 * Echoes legacy scalars without exposing them as UI; seeds details when empty.
 */
export function normalizeManufacturerConditions(
  raw: AdminManufacturerConditions | null | undefined,
): AdminManufacturerConditions {
  const base = emptyManufacturerConditions();
  if (!raw || typeof raw !== "object") return base;
  const normalized: AdminManufacturerConditions = {
    summary: String(raw.summary ?? "").trim(),
    details: String(raw.details ?? "").trim(),
    countryOfOrigin: String(raw.countryOfOrigin ?? "").trim(),
    marketedBy: String(raw.marketedBy ?? "").trim(),
    grievanceRedressal: String(raw.grievanceRedressal ?? "").trim(),
  };
  return {
    ...normalized,
    details: seedManufacturerDetailsFromLegacy(normalized),
  };
}
