import { apiRequest, unwrapData } from "./client";

export type SpinCampaignStatus = "draft" | "active" | "ended" | "disabled";
export type SpinSegmentType = "coupon" | "lose" | "no_reward";

export type SpinCouponTemplate = {
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrder: number;
  freeShipping: boolean;
  validityDays: number;
};

export type SpinSegmentInput = {
  label: string;
  type: SpinSegmentType;
  weight: number;
  displayMessage: string;
  couponTemplate: SpinCouponTemplate | null;
};

export type SpinSegment = SpinSegmentInput & {
  id: string;
};

export type SpinCampaignSummary = {
  id: string;
  name: string;
  slug: string;
  status: SpinCampaignStatus;
  startDate: string | null;
  endDate: string | null;
  headline: string;
  description: string;
  couponCodePrefix: string;
  updatedAt: string;
  createdAt: string;
};

export type SpinCampaignDetail = SpinCampaignSummary & {
  segments: SpinSegment[];
};

export type SpinCampaignPayload = {
  name: string;
  slug: string;
  status?: SpinCampaignStatus;
  startDate: string | null;
  endDate: string | null;
  headline: string;
  description: string;
  couponCodePrefix: string;
  segments: SpinSegmentInput[];
};

export type SpinAttemptRecord = {
  id: string;
  campaignId: string;
  shopper: {
    _id?: string;
    id?: string;
    username?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  segmentId: string;
  segmentLabel: string | null;
  outcome: "win" | "lose" | "no_reward";
  couponId: string | null;
  couponCode: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type SpinAttemptsPage = {
  items: SpinAttemptRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

function mapId(raw: Record<string, unknown>): string {
  return String(raw._id ?? raw.id ?? "");
}

function mapCouponTemplate(raw: unknown): SpinCouponTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  return {
    discountType: item.discountType === "fixed" ? "fixed" : "percentage",
    discountValue: Number(item.discountValue) || 0,
    minOrder: Number(item.minOrder) || 0,
    freeShipping: Boolean(item.freeShipping),
    validityDays: Math.max(1, Number(item.validityDays) || 1),
  };
}

function mapSegment(raw: Record<string, unknown>): SpinSegment | null {
  const id = mapId(raw);
  if (!id) return null;
  const type = String(raw.type ?? "") as SpinSegmentType;
  if (!["coupon", "lose", "no_reward"].includes(type)) return null;
  return {
    id,
    label: String(raw.label ?? ""),
    type,
    weight: Number(raw.weight) || 0,
    displayMessage: String(raw.displayMessage ?? ""),
    couponTemplate: type === "coupon" ? mapCouponTemplate(raw.couponTemplate) : null,
  };
}

function mapCampaignSummary(raw: Record<string, unknown>): SpinCampaignSummary | null {
  const id = mapId(raw);
  if (!id) return null;
  const status = String(raw.status ?? "draft") as SpinCampaignStatus;
  return {
    id,
    name: String(raw.name ?? ""),
    slug: String(raw.slug ?? ""),
    status: ["draft", "active", "ended", "disabled"].includes(status)
      ? status
      : "draft",
    startDate: raw.startDate ? String(raw.startDate) : null,
    endDate: raw.endDate ? String(raw.endDate) : null,
    headline: String(raw.headline ?? ""),
    description: String(raw.description ?? ""),
    couponCodePrefix: String(raw.couponCodePrefix ?? ""),
    updatedAt: String(raw.updatedAt ?? ""),
    createdAt: String(raw.createdAt ?? ""),
  };
}

function mapCampaignDetail(raw: Record<string, unknown>): SpinCampaignDetail | null {
  const summary = mapCampaignSummary(raw);
  if (!summary) return null;
  const segments = Array.isArray(raw.segments)
    ? raw.segments
        .map((item) => mapSegment(item as Record<string, unknown>))
        .filter((item): item is SpinSegment => Boolean(item))
    : [];
  return { ...summary, segments };
}

function mapAttempt(raw: Record<string, unknown>): SpinAttemptRecord | null {
  const id = mapId(raw);
  if (!id) return null;
  const outcome = String(raw.outcome ?? "") as SpinAttemptRecord["outcome"];
  return {
    id,
    campaignId: String(raw.campaignId ?? ""),
    shopper: (raw.shopper as SpinAttemptRecord["shopper"]) ?? null,
    segmentId: String(raw.segmentId ?? ""),
    segmentLabel: raw.segmentLabel != null ? String(raw.segmentLabel) : null,
    outcome: outcome === "win" || outcome === "lose" || outcome === "no_reward" ? outcome : "no_reward",
    couponId: raw.couponId != null ? String(raw.couponId) : null,
    couponCode: raw.couponCode != null ? String(raw.couponCode) : null,
    ipAddress: raw.ipAddress != null ? String(raw.ipAddress) : null,
    userAgent: raw.userAgent != null ? String(raw.userAgent) : null,
    createdAt: String(raw.createdAt ?? ""),
  };
}

function toApiPayload(input: SpinCampaignPayload): Record<string, unknown> {
  return {
    name: input.name.trim(),
    slug: input.slug.trim(),
    status: input.status ?? "draft",
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    headline: input.headline,
    description: input.description,
    couponCodePrefix: input.couponCodePrefix.trim(),
    segments: input.segments.map((segment) => ({
      label: segment.label.trim(),
      type: segment.type,
      weight: Number(segment.weight),
      displayMessage: segment.displayMessage,
      couponTemplate:
        segment.type === "coupon" && segment.couponTemplate
          ? {
              discountType: segment.couponTemplate.discountType,
              discountValue: Number(segment.couponTemplate.discountValue),
              minOrder: Number(segment.couponTemplate.minOrder) || 0,
              freeShipping: Boolean(segment.couponTemplate.freeShipping),
              validityDays: Math.max(1, Number(segment.couponTemplate.validityDays) || 1),
            }
          : null,
    })),
  };
}

export function emptyCouponTemplate(): SpinCouponTemplate {
  return {
    discountType: "percentage",
    discountValue: 0,
    minOrder: 0,
    freeShipping: false,
    validityDays: 7,
  };
}

export function emptySegment(type: SpinSegmentType = "coupon"): SpinSegmentInput {
  return {
    label: "",
    type,
    weight: 0,
    displayMessage: "",
    couponTemplate: type === "coupon" ? emptyCouponTemplate() : null,
  };
}

export async function fetchSpinCampaigns(): Promise<SpinCampaignSummary[]> {
  const response = await apiRequest<{ data?: unknown }>("/api/admin/spin-campaigns");
  const data = unwrapData(response);
  const list = Array.isArray(data) ? data : [];
  return list
    .map((item) => mapCampaignSummary(item as Record<string, unknown>))
    .filter((item): item is SpinCampaignSummary => Boolean(item));
}

export async function fetchSpinCampaign(id: string): Promise<SpinCampaignDetail | null> {
  const response = await apiRequest<{ data?: unknown }>(
    `/api/admin/spin-campaigns/${encodeURIComponent(id)}`,
  );
  return mapCampaignDetail(unwrapData(response) as Record<string, unknown>);
}

export async function createSpinCampaign(
  input: SpinCampaignPayload,
): Promise<SpinCampaignDetail | null> {
  const response = await apiRequest<{ data?: unknown }>("/api/admin/spin-campaigns", {
    method: "POST",
    body: toApiPayload(input),
  });
  return mapCampaignDetail(unwrapData(response) as Record<string, unknown>);
}

export async function updateSpinCampaign(
  id: string,
  input: SpinCampaignPayload,
): Promise<SpinCampaignDetail | null> {
  const response = await apiRequest<{ data?: unknown }>(
    `/api/admin/spin-campaigns/${encodeURIComponent(id)}`,
    { method: "PUT", body: toApiPayload(input) },
  );
  return mapCampaignDetail(unwrapData(response) as Record<string, unknown>);
}

export async function updateSpinCampaignStatus(
  id: string,
  status: SpinCampaignStatus,
): Promise<SpinCampaignDetail | null> {
  const response = await apiRequest<{ data?: unknown }>(
    `/api/admin/spin-campaigns/${encodeURIComponent(id)}/status`,
    { method: "PATCH", body: { status } },
  );
  return mapCampaignDetail(unwrapData(response) as Record<string, unknown>);
}

export async function deleteSpinCampaign(id: string): Promise<void> {
  await apiRequest(`/api/admin/spin-campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchSpinAttempts(
  id: string,
  page = 1,
  limit = 20,
): Promise<SpinAttemptsPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const response = await apiRequest<{ data?: unknown }>(
    `/api/admin/spin-campaigns/${encodeURIComponent(id)}/attempts?${params}`,
  );
  const data = unwrapData(response) as Record<string, unknown>;
  const items = Array.isArray(data.items)
    ? data.items
        .map((item) => mapAttempt(item as Record<string, unknown>))
        .filter((item): item is SpinAttemptRecord => Boolean(item))
    : [];
  const paginationRaw = (data.pagination ?? {}) as Record<string, unknown>;
  return {
    items,
    pagination: {
      page: Number(paginationRaw.page) || page,
      limit: Number(paginationRaw.limit) || limit,
      total: Number(paginationRaw.total) || items.length,
      pages: Number(paginationRaw.pages) || 1,
    },
  };
}
