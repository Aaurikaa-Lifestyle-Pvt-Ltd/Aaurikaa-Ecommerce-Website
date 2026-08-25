import { isApiCatalogue } from "@/lib/api/config";
import { fetchAnnouncementLines } from "@/lib/api/offers";
import { siteConfig } from "@/config/site";
import { AnnouncementBar } from "./announcement-bar";

/**
 * Announcement bar (brief §11).
 *
 * API catalogue mode: all active announcement offer texts from
 * `GET /api/admin/offers/active`. Multiple lines rotate in the client bar.
 * Hidden when none. Mock mode: site config line (demo shipping claim retained).
 */
export async function Announcement() {
  let lines: string[] = [];

  if (isApiCatalogue()) {
    try {
      lines = await fetchAnnouncementLines();
    } catch {
      lines = [];
    }
  } else {
    const fallback = siteConfig.announcement?.trim();
    if (fallback) lines = [fallback];
  }

  if (lines.length === 0) return null;

  return <AnnouncementBar lines={lines} />;
}
