import { apiRequest, unwrapData } from "./client";
import { ApiError } from "./errors";

export type SpinEligibility =
  | "eligible"
  | "already_spun"
  | "campaign_inactive"
  | "campaign_expired"
  | "campaign_not_started"
  | "no_active_campaign";

export type PublicSpinSegment = {
  id: string;
  label: string;
  displayMessage: string;
};

export type PublicSpinCampaign = {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  segments: PublicSpinSegment[];
};

export type SpinAttempt = {
  id: string;
  outcome: "win" | "lose" | "no_reward";
  segmentId: string;
  segmentLabel: string | null;
  displayMessage: string | null;
  couponCode: string | null;
  spunAt: string;
};

export type SpinStatus = {
  eligibility: SpinEligibility;
  campaign: PublicSpinCampaign | null;
  attempt: SpinAttempt | null;
};

export type SpinResult = {
  attempt: SpinAttempt;
  campaign: PublicSpinCampaign;
};

function mapId(raw: Record<string, unknown>): string {
  return String(raw._id ?? raw.id ?? "");
}

function mapSegment(raw: Record<string, unknown>): PublicSpinSegment | null {
  const id = mapId(raw);
  if (!id) return null;
  return {
    id,
    label: String(raw.label ?? ""),
    displayMessage: String(raw.displayMessage ?? ""),
  };
}

function mapCampaign(raw: Record<string, unknown> | null): PublicSpinCampaign | null {
  if (!raw) return null;
  const id = mapId(raw);
  if (!id) return null;
  const segments = Array.isArray(raw.segments)
    ? raw.segments
        .map((item) => mapSegment(item as Record<string, unknown>))
        .filter((item): item is PublicSpinSegment => Boolean(item))
    : [];
  return {
    id,
    name: String(raw.name ?? ""),
    slug: String(raw.slug ?? ""),
    headline: String(raw.headline ?? ""),
    description: String(raw.description ?? ""),
    startDate: raw.startDate ? String(raw.startDate) : null,
    endDate: raw.endDate ? String(raw.endDate) : null,
    segments,
  };
}

function mapAttempt(raw: Record<string, unknown> | null): SpinAttempt | null {
  if (!raw) return null;
  const id = mapId(raw);
  if (!id) return null;
  const outcome = String(raw.outcome ?? "") as SpinAttempt["outcome"];
  return {
    id,
    outcome:
      outcome === "win" || outcome === "lose" || outcome === "no_reward"
        ? outcome
        : "no_reward",
    segmentId: String(raw.segmentId ?? ""),
    segmentLabel: raw.segmentLabel != null ? String(raw.segmentLabel) : null,
    displayMessage: raw.displayMessage != null ? String(raw.displayMessage) : null,
    couponCode: raw.couponCode != null ? String(raw.couponCode) : null,
    spunAt: String(raw.spunAt ?? raw.createdAt ?? ""),
  };
}

function mapStatus(raw: Record<string, unknown>): SpinStatus {
  const eligibility = String(raw.eligibility ?? "no_active_campaign") as SpinEligibility;
  return {
    eligibility,
    campaign: mapCampaign((raw.campaign as Record<string, unknown>) ?? null),
    attempt: mapAttempt((raw.attempt as Record<string, unknown>) ?? null),
  };
}

function mapSpinResult(raw: Record<string, unknown>): SpinResult {
  const attempt = mapAttempt((raw.attempt as Record<string, unknown>) ?? null);
  const campaign = mapCampaign((raw.campaign as Record<string, unknown>) ?? null);
  if (!attempt || !campaign) {
    throw new ApiError("Spin completed without a valid result.", 500, "server");
  }
  return { attempt, campaign };
}

export async function fetchActiveSpinCampaign(slug?: string): Promise<PublicSpinCampaign | null> {
  const params = new URLSearchParams();
  if (slug?.trim()) params.set("slug", slug.trim());
  const qs = params.toString();
  const response = await apiRequest<{ data?: unknown }>(
    `/api/spin/active${qs ? `?${qs}` : ""}`,
    { auth: false },
  );
  const data = unwrapData(response) as Record<string, unknown>;
  return mapCampaign((data.campaign as Record<string, unknown>) ?? null);
}

export async function fetchSpinStatus(options?: {
  campaignId?: string;
  slug?: string;
}): Promise<SpinStatus> {
  const params = new URLSearchParams();
  if (options?.campaignId?.trim()) params.set("campaignId", options.campaignId.trim());
  if (options?.slug?.trim()) params.set("slug", options.slug.trim());
  const qs = params.toString();
  const response = await apiRequest<{ data?: unknown }>(
    `/api/shopper/spin/status${qs ? `?${qs}` : ""}`,
    { auth: true },
  );
  return mapStatus(unwrapData(response) as Record<string, unknown>);
}

export async function executeSpin(options?: {
  campaignId?: string;
  slug?: string;
}): Promise<SpinResult> {
  const response = await apiRequest<{ data?: unknown }>("/api/shopper/spin/spin", {
    method: "POST",
    auth: true,
    body: {
      campaignId: options?.campaignId,
      slug: options?.slug,
    },
  });
  return mapSpinResult(unwrapData(response) as Record<string, unknown>);
}

/** Extract attempt from 409 already-spun conflict responses. */
export function attemptFromSpinConflict(error: unknown): SpinAttempt | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.details as Record<string, unknown> | undefined;
  if (!details) return null;
  return mapAttempt((details.attempt as Record<string, unknown>) ?? null);
}
