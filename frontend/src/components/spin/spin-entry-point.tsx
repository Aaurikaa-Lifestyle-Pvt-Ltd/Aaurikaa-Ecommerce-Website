"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fetchActiveSpinCampaign, type PublicSpinCampaign } from "@/lib/api/spin";

/**
 * Floating Spin-to-Win entry point.
 *
 * Dynamically queries the active spin campaign (/api/spin/active).
 * Renders an unobtrusive, brand-aligned promotional entry point when an
 * active campaign exists, and hides itself when no campaign is active or
 * when already on the /spin-to-win page.
 */
export function SpinEntryPoint() {
  const pathname = usePathname();
  const [campaign, setCampaign] = useState<PublicSpinCampaign | null>(null);
  const [dismissed, setDismissed] = useState(false);

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

  if (!campaign || dismissed || pathname === "/spin-to-win") {
    return null;
  }

  const label = campaign.headline?.trim() || "Spin to Win";

  return (
    <aside
      aria-label="Spin to win promotion"
      className="fixed bottom-6 right-6 z-30 flex items-center"
    >
      <Link
        href="/spin-to-win"
        className="group flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2.5 text-xs font-medium tracking-wide text-foreground shadow-card transition-all duration-300 hover:scale-105 hover:border-foreground/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span
          className="inline-grid h-5 w-5 place-items-center rounded-full bg-foreground text-background transition-transform duration-500 group-hover:rotate-180"
          aria-hidden
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07 19.07 4.93" />
          </svg>
        </span>
        <span className="max-w-[140px] truncate sm:max-w-xs">{label}</span>
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss spin promotion"
        className="ml-1 inline-grid h-6 w-6 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="text-xs">×</span>
      </button>
    </aside>
  );
}
