"use client";

import { useEffect, useState } from "react";

const AUTOPLAY_MS = 5000;

type AnnouncementBarProps = {
  lines: string[];
};

/**
 * Thin announcement strip. One line stays static; multiple lines auto-rotate
 * (paused on hover / focus / reduced motion).
 */
export function AnnouncementBar({ lines }: AnnouncementBarProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const count = lines.length;
  const multi = count > 1;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const line = lines[safeIndex];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!multi || paused || reduceMotion) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [multi, paused, reduceMotion, count]);

  if (!line) return null;

  return (
    <div
      className="relative bg-foreground text-background"
      role={multi ? "region" : undefined}
      aria-roledescription={multi ? "carousel" : undefined}
      aria-label={multi ? "Announcements" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <p
        key={safeIndex}
        className={`mx-auto max-w-[1280px] px-4 py-2 text-center text-xs tracking-[0.14em] sm:px-6 lg:px-10 ${
          multi ? "pr-12 sm:pr-14" : ""
        } ${multi && !reduceMotion ? "animate-[announcement-fade_0.4s_ease]" : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {line}
      </p>
      {multi ? (
        <div className="absolute inset-y-0 right-4 flex items-center gap-1.5 sm:right-6 lg:right-10">
          {lines.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show announcement ${i + 1} of ${count}`}
              aria-current={i === safeIndex ? "true" : undefined}
              className={`h-1.5 w-1.5 rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background ${
                i === safeIndex
                  ? "bg-background opacity-100"
                  : "bg-background/45 opacity-70 hover:opacity-90"
              }`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
