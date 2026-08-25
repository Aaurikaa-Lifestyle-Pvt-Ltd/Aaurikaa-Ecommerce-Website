"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicSpinSegment } from "@/lib/api/spin";
import { cn } from "@/lib/cn";

// AAURIKAA premium styling tokens mapped for segment colors
const SEGMENT_STYLES = [
  { bg: "var(--accent)", text: "var(--accent-foreground)" },
  { bg: "var(--primary)", text: "var(--primary-foreground)" },
  { bg: "var(--background)", text: "var(--foreground)" },
  { bg: "var(--muted)", text: "var(--foreground)" },
];

type SpinWheelProps = {
  segments: PublicSpinSegment[];
  targetSegmentId?: string | null;
  spinning?: boolean;
  onSpinComplete?: () => void;
  className?: string;
};

export function SpinWheel({
  segments,
  targetSegmentId = null,
  spinning = false,
  onSpinComplete,
  className,
}: SpinWheelProps) {
  const [rotation, setRotation] = useState(0);
  const completedRef = useRef<string | null>(null);

  const sliceAngle = segments.length > 0 ? 360 / segments.length : 360;

  const gradient = useMemo(() => {
    if (segments.length === 0) {
      return "conic-gradient(var(--color-muted) 0deg 360deg)";
    }
    const stops = segments.map((_, index) => {
      const start = index * sliceAngle;
      const end = (index + 1) * sliceAngle;
      const style = SEGMENT_STYLES[index % SEGMENT_STYLES.length];
      return `${style.bg} ${start}deg ${end}deg`;
    });
    return `conic-gradient(from -90deg, ${stops.join(", ")})`;
  }, [segments, sliceAngle]);

  useEffect(() => {
    if (!spinning || !targetSegmentId || segments.length === 0) return;
    if (completedRef.current === targetSegmentId) return;

    const index = segments.findIndex((segment) => segment.id === targetSegmentId);
    if (index < 0) return;

    const centerAngle = index * sliceAngle + sliceAngle / 2;
    const pointerOffset = 270;
    const baseTurns = 5 * 360;
    const targetRotation = baseTurns + (pointerOffset - centerAngle);

    completedRef.current = targetSegmentId;
    setRotation(targetRotation);

    const timer = window.setTimeout(() => {
      onSpinComplete?.();
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [spinning, targetSegmentId, segments, sliceAngle, onSpinComplete]);

  // Generate gold bezel beads (watch-dial diamond markers)
  const bezelBeads = useMemo(() => {
    const beads = [];
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i * 360) / count - 90;
      const rad = (angle * Math.PI) / 180;
      const x = 50 + 47.5 * Math.cos(rad);
      const y = 50 + 47.5 * Math.sin(rad);
      beads.push({ x, y, id: i });
    }
    return beads;
  }, []);

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[320px]", className)}>
      {/* Pointer */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-2 flex flex-col items-center"
        aria-hidden
      >
        <div className="h-3 w-3 rounded-full bg-accent border border-accent-foreground/20 shadow-sm" />
        <div className="h-0 w-0 border-x-[8px] border-t-[20px] border-x-transparent border-t-accent -mt-1 drop-shadow-md" />
      </div>

      {/* Static Luxury Bezel Frame */}
      <div className="relative h-full w-full rounded-full border-[5px] border-accent bg-background p-1.5 shadow-[0_12px_36px_rgba(26,23,20,0.15)] flex items-center justify-center">
        {/* Diamond beads on static bezel */}
        {bezelBeads.map((bead) => (
          <span
            key={bead.id}
            className="absolute h-1 w-1 rounded-full bg-accent/40"
            style={{ left: `${bead.x}%`, top: `${bead.y}%` }}
          />
        ))}

        {/* Rotating Wheel Container */}
        <div
          className="relative h-full w-full rounded-full overflow-hidden spin-wheel-transition border border-accent/20"
          style={{
            background: gradient,
            transform: `rotate(${rotation}deg)`,
          }}
          aria-hidden
        >
          {/* Radial segment separators (spokes) */}
          {segments.map((segment, index) => (
            <div
              key={`divider-${segment.id}`}
              className="absolute left-1/2 top-1/2 h-[50%] w-[1.5px] bg-accent/20 origin-top -translate-x-1/2"
              style={{
                transform: `rotate(${index * sliceAngle}deg) translateX(-50%)`,
              }}
            />
          ))}

          {/* Segment Labels */}
          {segments.map((segment, index) => {
            const angle = index * sliceAngle + sliceAngle / 2 - 90;
            const radius = 34;
            const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
            const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
            
            const style = SEGMENT_STYLES[index % SEGMENT_STYLES.length];
            const textRotation = index * sliceAngle + sliceAngle / 2;

            return (
              <span
                key={segment.id}
                className="absolute max-w-[30%] -translate-x-1/2 -translate-y-1/2 text-center text-[10px] font-semibold tracking-wider uppercase leading-tight transition-colors duration-300 sm:text-xs"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  color: style.text,
                  transform: `translate(-50%, -50%) rotate(${textRotation}deg)`,
                }}
              >
                {segment.label}
              </span>
            );
          })}
        </div>

        {/* Central Dome (Static center piece) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-foreground/20 bg-gradient-to-b from-accent to-accent-foreground shadow-md flex items-center justify-center">
          <svg
            className="h-5 w-5 text-accent-foreground/90 drop-shadow-sm"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2l2.4 6.6 6.6 2.4-6.6 2.4-2.4 6.6-2.4-6.6-6.6-2.4 6.6-2.4z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
