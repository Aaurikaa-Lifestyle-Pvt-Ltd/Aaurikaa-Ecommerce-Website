"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchActiveSpinCampaign, type PublicSpinCampaign } from "@/lib/api/spin";

/**
 * Floating Spin-to-Win entry point and session-based promotional modal.
 *
 * Dynamically queries the active spin campaign (/api/spin/active).
 * Renders a brand-aligned luxury promotional entry point and modal.
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
      const focusable = modalRef.current.querySelectorAll("button, [href]");
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

  return (
    <>
      {/* Floating launcher pill matching reference design */}
      {!dismissed && (
        <aside
          aria-label="Spin to win promotion"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-6 right-4 sm:right-6 z-40 flex items-center gap-2"
        >
          <Link
            href="/spin-to-win"
            className="group flex items-center gap-2.5 sm:gap-3 rounded-full border border-[#d9cebe] bg-[#faf7f2]/95 backdrop-blur-md pl-1.5 pr-3.5 sm:pr-4 py-1.5 shadow-[0_6px_22px_rgba(0,0,0,0.14)] transition-all duration-300 hover:scale-[1.03] hover:border-[#a6875c] hover:shadow-[0_8px_26px_rgba(166,135,92,0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Spin & Win"
          >
            <div className="relative h-7 w-7 sm:h-8 sm:w-8 overflow-hidden rounded-full border border-[#c4ad8e] shadow-sm flex-shrink-0 bg-[#171512]">
              <img
                src="/images/spin-wheel-artwork.jpg"
                alt=""
                className="h-full w-full object-cover transition-transform duration-700 group-hover:rotate-180"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-[11px] text-[#a6875c]">✦</span>
              <span className="font-serif italic font-semibold tracking-wide text-xs sm:text-sm text-[#1a1714]">
                Spin & Win
              </span>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss spin promotion"
            className="inline-grid h-7 w-7 place-items-center rounded-full border border-[#d9cebe] bg-[#faf7f2]/95 backdrop-blur-md text-[#8c8275] transition-colors hover:bg-[#ede7dc] hover:text-[#171512] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs font-medium" aria-hidden="true">×</span>
          </button>
        </aside>
      )}

      {/* Promotional Modal matching reference design & fully responsive */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="promo-title"
          aria-describedby="promo-desc"
        >
          <div
            ref={modalRef}
            className="relative w-full max-w-sm sm:max-w-md md:max-w-4xl bg-[#faf7f2] border border-[#dfd4c4] rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.35)] overflow-hidden transition-all duration-300 flex flex-col md:flex-row max-h-[92dvh] my-auto"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={handleDismissModal}
              aria-label="Close promotion modal"
              className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 inline-grid h-8 w-8 place-items-center rounded-full border border-[#d9cebe] bg-[#faf7f2]/95 backdrop-blur-md text-[#171512] shadow-md transition-colors hover:border-[#171512] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-lg leading-none font-medium" aria-hidden="true">×</span>
            </button>

            {/* Left Column - 3D Golden Wheel & Jewellery Artwork */}
            <div className="w-full md:w-[48%] h-52 sm:h-64 md:h-auto md:min-h-[460px] bg-[#0f0d0b] relative flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src="/images/spin-wheel-artwork.jpg"
                alt="AAURIKAA Spin & Win Wheel"
                className="w-full h-full object-contain md:object-cover select-none pointer-events-none p-1.5 md:p-0"
              />
              {/* Subtle inner shadow and glow */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/20" />
            </div>

            {/* Right Column - Luxury Brand Campaign & Reward Perks */}
            <div className="w-full md:w-[52%] bg-[#faf7f2] px-5 py-5 sm:px-8 sm:py-7 md:p-11 flex flex-col justify-between items-center text-center relative overflow-y-auto md:overflow-visible">
              {/* Watermark Filigree Background Ornament */}
              <div
                className="absolute right-0 top-0 bottom-0 w-48 pointer-events-none opacity-[0.06] select-none overflow-hidden"
                aria-hidden="true"
              >
                <svg
                  className="w-full h-full text-[#a6875c]"
                  viewBox="0 0 200 400"
                  fill="currentColor"
                >
                  <path d="M100 0 C120 40 180 60 200 100 C180 140 120 160 100 200 C80 160 20 140 0 100 C20 60 80 40 100 0 Z" />
                  <path d="M100 200 C120 240 180 260 200 300 C180 340 120 360 100 400 C80 360 20 340 0 300 C20 260 80 240 100 200 Z" />
                </svg>
              </div>

              <div className="w-full flex-grow flex flex-col justify-center items-center my-auto relative z-10">
                {/* Brand Eyebrow with Star */}
                <div className="flex flex-col items-center gap-1 sm:gap-1.5 mb-1.5 sm:mb-2 text-[#a6875c] select-none" aria-hidden="true">
                  <span className="text-xs sm:text-sm">✦</span>
                  <span className="text-[10px] sm:text-[11px] tracking-[0.28em] font-sans font-semibold uppercase text-[#8c8275]">
                    AAURIKAA
                  </span>
                </div>

                {/* Campaign Headline */}
                <h2
                  id="promo-title"
                  className="font-serif text-2xl sm:text-3xl md:text-4xl text-[#1a1714] font-medium tracking-tight mb-1 sm:mb-2 leading-tight"
                >
                  Spin & Win
                </h2>

                {/* Subtitle */}
                <p
                  id="promo-desc"
                  className="text-xs sm:text-sm text-[#736c64] font-sans tracking-wide leading-relaxed mb-3.5 sm:mb-5 max-w-xs"
                >
                  Your chance to unlock{" "}
                  <span className="font-serif italic text-[#a6875c] font-medium">
                    exclusive rewards
                  </span>
                </p>

                {/* Golden Ornament Separator */}
                <div
                  className="flex items-center justify-center gap-3 w-28 sm:w-36 mb-4 sm:mb-6 text-[#a6875c]"
                  aria-hidden="true"
                >
                  <div className="h-[1px] bg-[#d9cebe] flex-1" />
                  <span className="text-[8px] sm:text-[9px] text-[#a6875c]">✦</span>
                  <div className="h-[1px] bg-[#d9cebe] flex-1" />
                </div>

                {/* 3 Reward Perks Badges with Connectors */}
                <div className="flex items-start justify-center gap-2.5 sm:gap-5 w-full max-w-sm mb-4 sm:mb-7 select-none">
                  {/* Perk 1: Exciting Discounts */}
                  <div className="flex flex-col items-center text-center flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-[#d9cebe] bg-[#fdfcf9] flex items-center justify-center text-[#9b7946] shadow-sm mb-1.5 sm:mb-2 transition-transform duration-300 hover:scale-105">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a1.44 1.44 0 002.036 0l5.859-5.859a1.44 1.44 0 000-2.036l-9.582-9.581a1.44 1.44 0 00-1.02-.422zM6 7.5h.008v.008H6V7.5z" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-sans text-[#2c2824] tracking-tight font-medium leading-snug">
                      Exciting<br />Discounts
                    </span>
                  </div>

                  <span className="text-[#a6875c]/40 text-[9px] sm:text-[10px] self-center -mt-5 sm:-mt-6">✦</span>

                  {/* Perk 2: Surprise Gifts */}
                  <div className="flex flex-col items-center text-center flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-[#d9cebe] bg-[#fdfcf9] flex items-center justify-center text-[#9b7946] shadow-sm mb-1.5 sm:mb-2 transition-transform duration-300 hover:scale-105">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12M3.75 8.25h16.5M12 7.5v13.5" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-sans text-[#2c2824] tracking-tight font-medium leading-snug">
                      Surprise<br />Gifts
                    </span>
                  </div>

                  <span className="text-[#a6875c]/40 text-[9px] sm:text-[10px] self-center -mt-5 sm:-mt-6">✦</span>

                  {/* Perk 3: Free Shipping */}
                  <div className="flex flex-col items-center text-center flex-1">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border border-[#d9cebe] bg-[#fdfcf9] flex items-center justify-center text-[#9b7946] shadow-sm mb-1.5 sm:mb-2 transition-transform duration-300 hover:scale-105">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.75a1.125 1.125 0 01-1.125-1.125V15m1.5 3.75h-.75m.75 0h.75m11.25-3.75a1.125 1.125 0 00-1.125-1.125H16.5M12 9h4.5m1.5 0h.75c.621 0 1.125.504 1.125 1.125v4.125M18 10.5h.008v.008H18v-.008zm-6-6h.008v.008H12V4.5zM3 5.25a1.125 1.125 0 011.125-1.125H9.75v10.5H3V5.25z" />
                      </svg>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-sans text-[#2c2824] tracking-tight font-medium leading-snug">
                      Free<br />Shipping
                    </span>
                  </div>
                </div>

                {/* Primary CTA: Solid Black Button with Luxury Gold/White Text */}
                <div className="w-full flex flex-col items-center gap-2.5 sm:gap-3">
                  <Link
                    href="/spin-to-win"
                    onClick={handleSpinWin}
                    className="w-full max-w-[240px] sm:max-w-[260px] py-3 sm:py-3.5 bg-[#171512] text-[#fbfaf8] hover:bg-[#282420] font-sans tracking-[0.2em] text-center shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 rounded-lg block text-xs uppercase font-semibold"
                  >
                    SPIN NOW
                  </Link>

                  {/* Secondary Link: Maybe later */}
                  <button
                    type="button"
                    onClick={handleDismissModal}
                    className="text-xs text-[#8c8275] hover:text-[#171512] font-sans tracking-wide transition-colors py-1 px-3"
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


