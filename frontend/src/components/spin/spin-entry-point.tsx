"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchActiveSpinCampaign, type PublicSpinCampaign } from "@/lib/api/spin";
import { SpinWheel } from "./spin-wheel";

/**
 * Floating Spin-to-Win entry point and session-based promotional modal.
 *
 * Dynamically queries the active spin campaign (/api/spin/active).
 * Renders an unobtrusive, brand-aligned promotional entry point when an
 * active campaign exists, and triggers an invitation modal once per browser session.
 */
export function SpinEntryPoint() {
  const pathname = usePathname();
  const [campaign, setCampaign] = useState<PublicSpinCampaign | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    fetchActiveSpinCampaign()
      .then((data) => {
        if (active) setCampaign(data);
      })
      .catch(() => {
        if (active) setCampaign(null);
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  // Modal delay and session check trigger
  useEffect(() => {
    if (!campaign || pathname === "/spin-to-win") {
      setShowModal(false);
      return;
    }

    if (typeof window !== "undefined") {
      const isDismissed = sessionStorage.getItem("aaurikaa_spin_modal_dismissed");
      if (isDismissed === "true") {
        return;
      }
    }

    const timer = setTimeout(() => {
      setShowModal(true);
      if (typeof document !== "undefined") {
        triggerRef.current = document.activeElement as HTMLElement;
      }
    }, 6000); // 6 seconds delay

    return () => clearTimeout(timer);
  }, [campaign, pathname]);

  // Focus trap, Escape dismissal, and scroll lock
  useEffect(() => {
    if (!showModal) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismissModal();
        return;
      }

      if (e.key === "Tab") {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Initial focus on first interactive element inside modal
    if (modalRef.current) {
      const focusable = modalRef.current.querySelectorAll('button, [href]');
      if (focusable.length > 0) {
        (focusable[0] as HTMLElement).focus();
      }
    }

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (triggerRef.current) {
        triggerRef.current.focus();
      }
    };
  }, [showModal]);

  const handleDismissModal = () => {
    setShowModal(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("aaurikaa_spin_modal_dismissed", "true");
    }
  };

  const handleSpinWin = () => {
    setShowModal(false);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("aaurikaa_spin_modal_dismissed", "true");
    }
  };

  if (!campaign || pathname === "/spin-to-win") {
    return null;
  }

  // Extract up to 3 reward highlights dynamically from the campaign segments
  const highlights = (campaign.segments && campaign.segments.length > 0)
    ? campaign.segments
        .filter((seg) => {
          const l = seg.label.toLowerCase();
          return !l.includes("no luck") && !l.includes("lose") && !l.includes("try again");
        })
        .slice(0, 3)
    : [];

  const displayHighlights = highlights.length > 0 ? highlights.map((h, i) => ({
    id: h.id || String(i),
    label: h.label,
    type: /%|off|discount/i.test(h.label) ? "discount" : (/free\s*ship|delivery|shipping/i.test(h.label) ? "shipping" : "gift")
  })) : [
    { id: "1", label: "Exciting Discounts", type: "discount" },
    { id: "2", label: "Surprise Gifts", type: "gift" },
    { id: "3", label: "Free Shipping", type: "shipping" }
  ];

  return (
    <>
      {/* Floating launcher */}
      {!dismissed && (
        <aside
          aria-label="Spin to win promotion"
          className="fixed bottom-6 right-6 z-30 flex items-center"
        >
          <Link
            href="/spin-to-win"
            className="group flex items-center gap-2.5 rounded-full border border-accent/30 bg-gradient-to-r from-surface to-muted/40 backdrop-blur-md px-4 py-2.5 text-xs font-medium tracking-wide text-foreground shadow-[0_6px_20px_rgba(166,135,92,0.12)] transition-all duration-300 hover:scale-[1.03] hover:border-accent/60 hover:shadow-[0_8px_24px_rgba(166,135,92,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Spin & Win"
          >
            <span
              className="inline-grid h-5.5 w-5.5 place-items-center rounded-full bg-accent/10 text-accent transition-transform duration-700 group-hover:rotate-180"
              aria-hidden
            >
              <svg
                className="h-3.5 w-3.5 text-accent animate-spin-gentle"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6" strokeWidth="1" />
              </svg>
            </span>
            <span className="font-serif italic text-accent font-semibold tracking-wide text-xs">
              ✦ Spin & Win
            </span>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss spin promotion"
            className="ml-1.5 inline-grid h-6 w-6 place-items-center rounded-full border border-border/30 bg-surface/85 backdrop-blur-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs" aria-hidden="true">×</span>
          </button>
        </aside>
      )}

      {/* Promotional Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm transition-opacity duration-300"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promo-title"
          aria-describedby="promo-desc"
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-4xl bg-surface border border-accent/25 rounded-card shadow-[0_20px_50px_rgba(26,23,20,0.22)] overflow-hidden transition-all duration-300 scale-100 flex flex-col md:flex-row"
          >
            <button
              type="button"
              onClick={handleDismissModal}
              aria-label="Close promotion modal"
              className="absolute top-4 right-4 z-20 inline-grid h-8 w-8 place-items-center rounded-full border border-border/40 bg-surface/90 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-xl leading-none" aria-hidden="true">×</span>
            </button>

            {/* Left Column - Imagery and Spin Wheel (Visually Rich) */}
            <div className="w-full md:w-1/2 bg-[#171512] flex items-center justify-center p-8 relative min-h-[280px] md:min-h-[460px]">
              {/* Background Jewellery Image & Overlay */}
              <div className="absolute inset-0 z-0">
                <img
                  src="/images/auth_login_jewellery.jpg"
                  alt=""
                  className="w-full h-full object-cover mix-blend-overlay opacity-30 select-none pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#171512] via-transparent to-black/20" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(166,135,92,0.15)_0%,transparent_70%)]" />
              </div>

              {/* Sparkle particles floating over the wheel */}
              <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden" aria-hidden="true">
                <span className="absolute left-[15%] top-[15%] text-accent/30 text-lg animate-sparkle-1">✦</span>
                <span className="absolute right-[20%] top-[25%] text-accent/25 text-sm animate-sparkle-2">✦</span>
                <span className="absolute left-[35%] bottom-[20%] text-accent/20 text-xs animate-sparkle-3">✦</span>
                <span className="absolute right-[30%] bottom-[15%] text-accent/15 text-lg animate-sparkle-4">✦</span>
              </div>

              {/* SpinWheel decoration wrapper */}
              <div className="relative z-10 w-full max-w-[280px] md:max-w-[310px] transform transition-transform duration-500 hover:scale-[1.02]">
                <div className="absolute -inset-3.5 rounded-full bg-accent/10 blur-xl opacity-75 pointer-events-none" />
                <SpinWheel segments={campaign.segments} className="scale-[0.9] sm:scale-95 pointer-events-none" />
              </div>
            </div>

            {/* Right Column - Brand Campaign and CTA */}
            <div className="w-full md:w-1/2 bg-[#faf8f4] p-8 sm:p-10 md:p-12 flex flex-col justify-between items-center md:items-start text-center md:text-left relative min-h-[380px] md:min-h-[460px]">
              <div className="w-full flex-grow flex flex-col justify-center items-center md:items-start my-auto">
                {/* Brand Header */}
                <div className="flex items-center gap-1.5 mb-3 text-accent/80 select-none" aria-hidden="true">
                  <span className="text-[10px] tracking-[0.25em] font-sans font-semibold uppercase">✦ AAURIKAA</span>
                </div>

                {/* Campaign Headline */}
                <h2
                  id="promo-title"
                  className="font-serif text-2xl sm:text-3.5xl text-foreground tracking-tight mb-2.5 leading-tight font-medium"
                >
                  {campaign.headline?.trim() || "Spin & Win"}
                </h2>

                {/* Short campaign description */}
                <p
                  id="promo-desc"
                  className="text-xs sm:text-sm text-muted-foreground font-sans tracking-wide leading-relaxed mb-6 max-w-sm md:max-w-md"
                >
                  Your chance to unlock <span className="font-serif italic text-accent font-medium">exclusive rewards</span>. {campaign.description?.trim() || "Spin the wheel for an exclusive discount or complimentary jewellery reward."}
                </p>

                {/* Thin Editorial Separator */}
                <div className="w-full flex items-center justify-center md:justify-start gap-3.5 mb-7 text-accent/30" aria-hidden="true">
                  <div className="h-[1px] bg-accent/20 w-16" />
                  <span className="text-[9px] text-accent/60">✦</span>
                  <div className="h-[1px] bg-accent/20 w-16" />
                </div>

                {/* Dynamic Reward Highlights */}
                <div className="grid grid-cols-3 gap-4 sm:gap-6 w-full max-w-sm mb-8 select-none">
                  {displayHighlights.map((hl) => (
                    <div key={hl.id} className="flex flex-col items-center text-center">
                      <div className="w-11 h-11 rounded-full border border-accent/20 bg-surface/85 flex items-center justify-center text-accent mb-2 shadow-sm transition-transform duration-300 hover:scale-105">
                        {hl.type === "discount" && (
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.44 1.44 0 002.036 0l5.859-5.859a1.44 1.44 0 000-2.036l-9.582-9.581a1.44 1.44 0 00-1.02-.422zM6 7.5h.008v.008H6V7.5z" />
                          </svg>
                        )}
                        {hl.type === "shipping" && (
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.75a1.125 1.125 0 01-1.125-1.125V15m1.5 3.75h-.75m.75 0h.75m11.25-3.75a1.125 1.125 0 00-1.125-1.125H16.5M12 9h4.5m1.5 0h.75c.621 0 1.125.504 1.125 1.125v4.125M18 10.5h.008v.008H18v-.008zm-6-6h.008v.008H12V4.5zM3 5.25a1.125 1.125 0 011.125-1.125H9.75v10.5H3V5.25z" />
                          </svg>
                        )}
                        {hl.type === "gift" && (
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12M3.75 8.25h16.5M12 7.5v13.5" />
                          </svg>
                        )}
                      </div>
                      <span className="text-[10px] sm:text-xs font-serif italic text-foreground tracking-wide font-medium leading-tight">
                        {hl.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Action buttons */}
                <div className="w-full flex flex-col items-center md:items-start gap-4">
                  <Link
                    href="/spin-to-win"
                    onClick={handleSpinWin}
                    className="w-full max-w-[280px] py-3.5 bg-shimmer-button text-primary-foreground font-serif tracking-[0.2em] text-center shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform duration-300 rounded-control block text-xs uppercase font-semibold"
                  >
                    Spin Now
                  </Link>
                  <button
                    type="button"
                    onClick={handleDismissModal}
                    className="text-[10px] text-muted-foreground/75 hover:text-foreground font-sans tracking-widest uppercase font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-control py-1 px-4 mt-1"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

