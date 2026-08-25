import { apiRequest } from "./client";
import { idString } from "../mappers/media";

export type WeightClassOption = { id: string; name: string };

export async function fetchWeightClasses(): Promise<WeightClassOption[]> {
  const response = await apiRequest<unknown>("/api/shipping/weight-classes", { auth: false });
  if (!Array.isArray(response)) return [];
  return response
    .map((item) => {
      const record = item as { _id?: unknown; name?: string };
      const id = idString(record._id);
      const name = String(record.name ?? "").trim();
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((item): item is WeightClassOption => Boolean(item));
}

/** Free-shipping threshold rule (min order amount). No invented defaults. */
export type AdminFreeShippingRule = {
  id: string;
  name: string;
  minOrderAmountINR: number;
  active: boolean;
};

function mapFreeRule(item: unknown): AdminFreeShippingRule | null {
  const raw = item as {
    _id?: unknown;
    id?: unknown;
    name?: string;
    minOrderAmountINR?: number;
    active?: boolean;
  };
  const id = idString(raw._id ?? raw.id);
  if (!id) return null;
  const amount = Number(raw.minOrderAmountINR);
  return {
    id,
    name: String(raw.name ?? "").trim(),
    minOrderAmountINR: Number.isFinite(amount) ? amount : 0,
    active: raw.active !== false,
  };
}

/**
 * GET /api/shipping/free-rules?includeInactive=true
 * Falls back to active-only list if includeInactive is unsupported.
 */
export async function fetchFreeShippingRules(): Promise<AdminFreeShippingRule[]> {
  try {
    const response = await apiRequest<unknown>(
      "/api/shipping/free-rules?includeInactive=true",
    );
    if (!Array.isArray(response)) return [];
    return response
      .map(mapFreeRule)
      .filter((item): item is AdminFreeShippingRule => Boolean(item));
  } catch {
    const response = await apiRequest<unknown>("/api/shipping/free-rules");
    if (!Array.isArray(response)) return [];
    return response
      .map(mapFreeRule)
      .filter((item): item is AdminFreeShippingRule => Boolean(item));
  }
}

export async function createFreeShippingRule(input: {
  name: string;
  minOrderAmountINR: number;
  active: boolean;
}): Promise<AdminFreeShippingRule> {
  const response = await apiRequest<unknown>("/api/shipping/free-rules", {
    method: "POST",
    body: {
      name: input.name.trim(),
      minOrderAmountINR: input.minOrderAmountINR,
      active: input.active,
      allZones: true,
    },
  });
  const mapped = mapFreeRule(response);
  if (!mapped) {
    throw new Error("Free shipping rule was created but could not be read.");
  }
  return mapped;
}

export async function updateFreeShippingRule(
  id: string,
  input: {
    name: string;
    minOrderAmountINR: number;
    active: boolean;
  },
): Promise<AdminFreeShippingRule> {
  const response = await apiRequest<unknown>(
    `/api/shipping/free-rules/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: {
        name: input.name.trim(),
        minOrderAmountINR: input.minOrderAmountINR,
        active: input.active,
      },
    },
  );
  const mapped = mapFreeRule(response);
  if (!mapped) {
    throw new Error("Free shipping rule was updated but could not be read.");
  }
  return mapped;
}
