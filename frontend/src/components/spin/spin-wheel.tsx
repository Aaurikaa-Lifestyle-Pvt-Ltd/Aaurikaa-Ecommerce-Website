"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicSpinSegment } from "@/lib/api/spin";
import { cn } from "@/lib/cn";

const WHEEL_COLORS = [
  "var(--color-primary)",
  "var(--color-muted)",
  "var(--color-foreground)",
  "var(--color-border)",
  "var(--color-primary)",
  "var(--color-muted)",
  "var(--color-foreground)",
  "var(--color-border)",
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
      const color = WHEEL_COLORS[index % WHEEL_COLORS.length];
      return `${color} ${start}deg ${end}deg`;
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

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[320px]", className)}>
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
        aria-hidden
      >
        <div className="h-0 w-0 border-x-[12px] border-b-[20px] border-x-transparent border-b-foreground" />
      </div>
      <div
        className="relative h-full w-full rounded-full border-4 border-foreground/80 shadow-lg transition-transform duration-[4000ms] ease-out"
        style={{
          background: gradient,
          transform: `rotate(${rotation}deg)`,
        }}
        aria-hidden
      >
        {segments.map((segment, index) => {
          const angle = index * sliceAngle + sliceAngle / 2 - 90;
          const radius = 38;
          const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
          const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
          return (
            <span
              key={segment.id}
              className="absolute max-w-[30%] -translate-x-1/2 -translate-y-1/2 text-center text-[10px] font-medium leading-tight text-background sm:text-xs"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              {segment.label}
            </span>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-[18%] rounded-full border border-background/40 bg-background/90" />
    </div>
  );
}
