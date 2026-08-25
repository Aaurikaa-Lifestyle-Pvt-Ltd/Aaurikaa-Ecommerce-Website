"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ShopperAuthPanel } from "@/components/account/shopper-auth-panel";
import { SpinWheel } from "@/components/spin/spin-wheel";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { ApiError } from "@/lib/api/errors";
import {
  attemptFromSpinConflict,
  executeSpin,
  fetchActiveSpinCampaign,
  fetchSpinStatus,
  type PublicSpinCampaign,
  type SpinAttempt,
  type SpinEligibility,
  type SpinStatus,
} from "@/lib/api/spin";

type PagePhase =
  | "loading"
  | "inactive"
  | "login"
  | "eligible"
  | "spinning"
  | "result"
  | "already_spun"
  | "error";

function eligibilityMessage(eligibility: SpinEligibility): string {
  switch (eligibility) {
    case "campaign_inactive":
      return "This spin campaign is not active right now.";
    case "campaign_expired":
      return "This spin campaign has ended.";
    case "campaign_not_started":
      return "This spin campaign has not started yet.";
    case "no_active_campaign":
      return "There is no active spin campaign at the moment.";
    case "already_spun":
      return "You have already used your spin for this campaign.";
    default:
      return "Spin is not available.";
  }
}

function outcomeHeadline(attempt: SpinAttempt): string {
  if (attempt.outcome === "win") return "Congratulations!";
  if (attempt.outcome === "lose") return "Better luck next time";
  return "Thanks for playing";
}

export default function SpinToWinPage() {
  const { user, ready, configured } = useShopperAuth();
  const [campaign, setCampaign] = useState<PublicSpinCampaign | null>(null);
  const [status, setStatus] = useState<SpinStatus | null>(null);
  const [phase, setPhase] = useState<PagePhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<SpinAttempt | null>(null);
  const [animating, setAnimating] = useState(false);
  const [targetSegmentId, setTargetSegmentId] = useState<string | null>(null);
  const spinLockRef = useRef(false);

  const resolvePhase = useCallback(
    (preview: PublicSpinCampaign | null, shopperStatus: SpinStatus | null, signedIn: boolean) => {
      if (!preview && (!shopperStatus || shopperStatus.eligibility === "no_active_campaign")) {
        return "inactive" as const;
      }

      if (!signedIn) {
        if (
          preview ||
          (shopperStatus &&
            shopperStatus.eligibility !== "no_active_campaign")
        ) {
          return "login" as const;
        }
        return "inactive" as const;
      }

      if (!shopperStatus) return "loading" as const;

      if (shopperStatus.eligibility === "already_spun") {
        setAttempt(shopperStatus.attempt);
        return "already_spun" as const;
      }

      if (shopperStatus.eligibility === "eligible") {
        return "eligible" as const;
      }

      if (
        shopperStatus.eligibility === "campaign_inactive" ||
        shopperStatus.eligibility === "campaign_expired" ||
        shopperStatus.eligibility === "campaign_not_started" ||
        shopperStatus.eligibility === "no_active_campaign"
      ) {
        return "inactive" as const;
      }

      return "error" as const;
    },
    [],
  );

  const load = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const preview = await fetchActiveSpinCampaign();
      setCampaign(preview);

      if (user && configured) {
        const shopperStatus = await fetchSpinStatus(
          preview?.id ? { campaignId: preview.id } : undefined,
        );
        setStatus(shopperStatus);
        if (shopperStatus.campaign) setCampaign(shopperStatus.campaign);
        setPhase(resolvePhase(preview ?? shopperStatus.campaign, shopperStatus, true));
      } else {
        setStatus(null);
        setPhase(resolvePhase(preview, null, false));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load spin campaign.");
      setPhase("error");
    }
  }, [configured, resolvePhase, user]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  async function handleSpin() {
    if (spinLockRef.current || phase !== "eligible" || !campaign) return;
    spinLockRef.current = true;
    setPhase("spinning");
    setAnimating(true);
    setError(null);

    try {
      const result = await executeSpin({ campaignId: campaign.id });
      setAttempt(result.attempt);
      setTargetSegmentId(result.attempt.segmentId);
      setCampaign(result.campaign);
    } catch (err) {
      spinLockRef.current = false;
      setAnimating(false);
      setTargetSegmentId(null);

      if (err instanceof ApiError && err.status === 409) {
        const prior = attemptFromSpinConflict(err);
        if (prior) {
          setAttempt(prior);
          setPhase("already_spun");
          return;
        }
      }

      setError(err instanceof ApiError ? err.message : "Unable to complete your spin.");
      setPhase("error");
    }
  }

  function handleAnimationComplete() {
    spinLockRef.current = false;
    setAnimating(false);
    setPhase("result");
  }

  const displayCampaign = status?.campaign ?? campaign;
  const inactiveReason =
    status?.eligibility && status.eligibility !== "eligible" && status.eligibility !== "already_spun"
      ? eligibilityMessage(status.eligibility)
      : "There is no active spin campaign at the moment.";

  if (!ready || phase === "loading") {
    return (
      <div className="py-16">
        <Container className="flex items-center justify-center gap-3">
          <Spinner className="h-5 w-5" />
          <p className="text-sm text-muted-foreground">Loading spin campaign…</p>
        </Container>
      </div>
    );
  }

  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-3">Promotions</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            {displayCampaign?.headline?.trim() || "Spin to Win"}
          </h1>
          {displayCampaign?.description ? (
            <p className="mt-4 text-sm text-muted-foreground sm:text-base">
              {displayCampaign.description}
            </p>
          ) : null}

          {phase === "inactive" ? (
            <div className="mt-10 rounded-lg border border-border bg-surface p-8">
              <p className="text-sm text-muted-foreground">{inactiveReason}</p>
              <div className="mt-6">
                <ButtonLink href="/collections/new-arrivals" variant="primary">
                  Continue shopping
                </ButtonLink>
              </div>
            </div>
          ) : null}

          {phase === "login" ? (
            <div className="mt-10 space-y-8">
              {displayCampaign && displayCampaign.segments.length > 0 ? (
                <SpinWheel segments={displayCampaign.segments} />
              ) : null}
              <div className="mx-auto max-w-md text-left">
                <ShopperAuthPanel
                  title="Sign in to spin"
                  description="Create an account or sign in to claim your one-time spin."
                  onAuthenticated={() => void load()}
                />
              </div>
            </div>
          ) : null}

          {(phase === "eligible" ||
            phase === "spinning" ||
            phase === "result" ||
            phase === "already_spun") &&
          displayCampaign ? (
            <div className="mt-10 space-y-8">
              <SpinWheel
                segments={displayCampaign.segments}
                targetSegmentId={targetSegmentId}
                spinning={animating}
                onSpinComplete={handleAnimationComplete}
              />

              {phase === "eligible" ? (
                <div>
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => void handleSpin()}
                    disabled={animating}
                  >
                    Spin the wheel
                  </Button>
                  <p className="mt-3 text-xs text-muted-foreground">
                    One spin per account for this campaign.
                  </p>
                </div>
              ) : null}

              {phase === "spinning" && !targetSegmentId ? (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner className="h-4 w-4" />
                  Processing your spin…
                </div>
              ) : null}

              {(phase === "result" || phase === "already_spun") && attempt ? (
                <div className="rounded-lg border border-border bg-surface p-6 text-left">
                  <p className="font-serif text-2xl">{outcomeHeadline(attempt)}</p>
                  {attempt.displayMessage ? (
                    <p className="mt-2 text-sm text-muted-foreground">{attempt.displayMessage}</p>
                  ) : null}
                  {attempt.outcome === "win" && attempt.couponCode ? (
                    <div className="mt-4 rounded-md border border-dashed border-foreground/30 bg-muted/40 px-4 py-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Your coupon code
                      </p>
                      <p className="mt-1 font-mono text-lg tracking-wider">{attempt.couponCode}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Apply this code at checkout before it expires.
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-6 flex flex-wrap gap-3">
                    <ButtonLink href="/cart" variant="primary">
                      Shop now
                    </ButtonLink>
                    {attempt.outcome === "win" && attempt.couponCode ? (
                      <ButtonLink href="/cart" variant="secondary">
                        Go to cart
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "error" ? (
            <div className="mt-10 rounded-lg border border-border bg-surface p-8">
              <p className="text-sm text-sale" role="alert">
                {error || "Something went wrong."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button type="button" variant="primary" onClick={() => void load()}>
                  Try again
                </Button>
                <Link href="/" className="text-sm font-medium underline-offset-4 hover:underline">
                  Back to home
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </Container>
    </div>
  );
}
