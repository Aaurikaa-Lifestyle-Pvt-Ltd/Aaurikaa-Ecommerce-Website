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
  const [copied, setCopied] = useState(false);
  const spinLockRef = useRef(false);

  const handleCopy = useCallback(() => {
    if (attempt?.couponCode) {
      void navigator.clipboard.writeText(attempt.couponCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [attempt?.couponCode]);

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
    <div className="pb-16 pt-8 sm:pb-24 sm:pt-12">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow mb-3 text-accent tracking-widest">Promotions</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl md:text-5xl text-foreground">
            {displayCampaign?.headline?.trim() || "Spin to Win"}
          </h1>
          {displayCampaign?.description ? (
            <p className="mt-4 text-sm text-muted-foreground sm:text-base max-w-lg mx-auto leading-relaxed">
              {displayCampaign.description}
            </p>
          ) : null}

          {phase === "inactive" ? (
            <div className="mt-12 rounded-card border border-border bg-surface px-6 py-10 sm:px-10 sm:py-12 shadow-soft max-w-md mx-auto">
              <p className="text-sm text-muted-foreground tracking-wide leading-relaxed">{inactiveReason}</p>
              <div className="mt-8">
                <ButtonLink href="/collections/new-arrivals" variant="primary">
                  Continue shopping
                </ButtonLink>
              </div>
            </div>
          ) : null}

          {phase === "login" ? (
            <div className="mt-12 space-y-10">
              {displayCampaign && displayCampaign.segments.length > 0 ? (
                <div className="relative p-4 max-w-xs mx-auto">
                  <SpinWheel segments={displayCampaign.segments} className="opacity-80" />
                </div>
              ) : null}
              <div className="mx-auto max-w-md text-left p-6 sm:p-8 rounded-card border border-accent/20 bg-surface shadow-card">
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
            <div className="mt-12 space-y-10">
              <div className="relative max-w-xs sm:max-w-sm mx-auto p-2">
                <SpinWheel
                  segments={displayCampaign.segments}
                  targetSegmentId={targetSegmentId}
                  spinning={animating}
                  onSpinComplete={handleAnimationComplete}
                />
              </div>

              {phase === "eligible" ? (
                <div className="max-w-md mx-auto space-y-4">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => void handleSpin()}
                    disabled={animating}
                    className="w-full sm:w-auto px-10 bg-shimmer-button text-primary-foreground font-serif tracking-widest shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform duration-300"
                  >
                    Spin the wheel
                  </Button>
                  <p className="text-xs text-muted-foreground tracking-wide">
                    One spin per account for this campaign.
                  </p>
                </div>
              ) : null}

              {phase === "spinning" && !targetSegmentId ? (
                <div className="flex items-center justify-center gap-2.5 text-sm text-accent font-medium tracking-wide">
                  <Spinner className="h-4.5 w-4.5 text-accent" />
                  Preparing your reward…
                </div>
              ) : null}

              {(phase === "result" || phase === "already_spun") && attempt ? (
                <div className="relative overflow-hidden rounded-card border border-accent/20 bg-surface p-6 sm:p-8 text-center shadow-card max-w-md mx-auto">
                  {/* Subtle Sparkles celebration animation (CSS based particles) */}
                  {attempt.outcome === "win" && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                      <span className="absolute left-[15%] bottom-2 text-accent/40 text-lg animate-sparkle-1">✦</span>
                      <span className="absolute left-[45%] bottom-2 text-accent/30 text-sm animate-sparkle-2">✦</span>
                      <span className="absolute left-[75%] bottom-2 text-accent/40 text-lg animate-sparkle-3">✦</span>
                      <span className="absolute left-[85%] bottom-2 text-accent/20 text-xs animate-sparkle-4">✦</span>
                      <span className="absolute left-[30%] bottom-4 text-accent/20 text-xs animate-sparkle-2">✦</span>
                    </div>
                  )}
                  
                  <p className="eyebrow mb-1 text-accent">
                    {phase === "already_spun" ? "Prior Reward" : "Your Reward"}
                  </p>
                  <h2 className="font-serif text-2xl sm:text-3xl text-foreground tracking-tight mb-2">
                    {outcomeHeadline(attempt)}
                  </h2>
                  {attempt.displayMessage ? (
                    <p className="text-sm text-muted-foreground font-sans tracking-wide leading-relaxed mb-6">
                      {attempt.displayMessage}
                    </p>
                  ) : null}
                  
                  {attempt.outcome === "win" && attempt.couponCode ? (
                    <div className="bg-shimmer-gold rounded-control border border-accent/25 px-5 py-4 mb-6 relative group/coupon">
                      <p className="text-[10px] uppercase tracking-widest text-accent font-medium mb-1">
                        EXCLUSIVE COUPON CODE
                      </p>
                      <p className="font-mono text-xl font-bold tracking-wider text-foreground select-all select-all-touch">
                        {attempt.couponCode}
                      </p>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="mt-3.5 inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-foreground hover:bg-accent border border-accent/30 px-3.5 py-1 rounded-control transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Copy coupon code to clipboard"
                      >
                        {copied ? (
                          <>
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                              <path d="M8 3H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2h-3m-4 0v2m0-2a2 2 0 012-2h2a2 2 0 012 2m-4 0h4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span>Copy Code</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
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
            <div className="mt-12 rounded-card border border-border bg-surface p-8 max-w-md mx-auto">
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
