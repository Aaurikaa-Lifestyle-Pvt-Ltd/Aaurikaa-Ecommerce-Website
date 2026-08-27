"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicSpinSegment } from "@/lib/api/spin";
import { cn } from "@/lib/cn";

// AAURIKAA luxury color palette with guaranteed high-contrast text pairings
const WHEEL_PALETTE = [
  { fill: "#1a1714", text: "#fbfaf8", border: "#a6875c" }, // Noir with Ivory text
  { fill: "#a6875c", text: "#ffffff", border: "#1a1714" }, // Champagne Gold with White text
  { fill: "#faf8f4", text: "#1a1714", border: "#dcd5c9" }, // Pearl Ivory with Deep Charcoal text
  { fill: "#2b251f", text: "#e8dfd3", border: "#a6875c" }, // Espresso with Champagne text
  { fill: "#c4a476", text: "#1a1714", border: "#1a1714" }, // Soft Gold with Dark text
  { fill: "#f1ece4", text: "#1a1714", border: "#dcd5c9" }, // Warm Cream with Deep Charcoal text
];

type SpinWheelProps = {
  segments: PublicSpinSegment[];
  targetSegmentId?: string | null;
  spinning?: boolean;
  onSpinComplete?: () => void;
  className?: string;
};

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M", x, y,
    "L", start.x, start.y,
    "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
    "Z",
  ].join(" ");
}

export function SpinWheel({
  segments,
  targetSegmentId = null,
  spinning = false,
  onSpinComplete,
  className,
}: SpinWheelProps) {
  const [rotation, setRotation] = useState(0);
  const completedRef = useRef<string | null>(null);

  const numSegments = segments.length || 6;
  const sliceAngle = 360 / numSegments;

  useEffect(() => {
    if (!spinning || !targetSegmentId || segments.length === 0) return;
    if (completedRef.current === targetSegmentId) return;

    const index = segments.findIndex((segment) => segment.id === targetSegmentId);
    if (index < 0) return;

    // Center angle of the winning slice (measured clockwise from 12 o'clock)
    const sliceCenter = index * sliceAngle + sliceAngle / 2;
    // Pointer is at top (0° / 12 o'clock)
    const baseSpins = 5 * 360;
    const targetRotation = baseSpins + (360 - sliceCenter);

    completedRef.current = targetSegmentId;
    setRotation(targetRotation);

    const timer = window.setTimeout(() => {
      onSpinComplete?.();
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [spinning, targetSegmentId, segments, sliceAngle, onSpinComplete]);

  // Generate 16 luxury bezel beads around the perimeter
  const bezelBeads = useMemo(() => {
    const beads = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i * 360) / count;
      const pt = polarToCartesian(160, 160, 150, angle);
      beads.push({ x: pt.x, y: pt.y, id: i });
    }
    return beads;
  }, []);

  return (
    <div className={cn("relative mx-auto aspect-square w-full max-w-[340px]", className)}>
      {/* Top Center Pointer Needle */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-2.5 flex flex-col items-center drop-shadow-md"
        aria-hidden
      >
        <div className="size-3.5 rounded-full border-2 border-[#8c6f46] bg-[#a6875c] shadow-sm" />
        <div className="h-0 w-0 -mt-1 border-x-[8px] border-t-[20px] border-x-transparent border-t-[#8c6f46]" />
      </div>

      {/* SVG Wheel Display */}
      <div className="relative h-full w-full rounded-full border-[5px] border-[#a6875c] bg-[#faf8f4] p-1 shadow-[0_16px_40px_-8px_rgba(26,23,20,0.22)]">
        <svg
          viewBox="0 0 320 320"
          className="h-full w-full rounded-full overflow-hidden"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4.2s cubic-bezier(0.12, 0.99, 0.28, 1)" : "none",
          }}
        >
          <defs>
            <radialGradient id="centerHubGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#d8be96" />
              <stop offset="70%" stopColor="#a6875c" />
              <stop offset="100%" stopColor="#7a5e35" />
            </radialGradient>
            <filter id="hubShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Slices */}
          {segments.map((segment, index) => {
            const startAngle = index * sliceAngle;
            const endAngle = (index + 1) * sliceAngle;
            const pathD = describeArc(160, 160, 154, startAngle, endAngle);
            const theme = WHEEL_PALETTE[index % WHEEL_PALETTE.length];
            const textAngle = startAngle + sliceAngle / 2;
            const textPos = polarToCartesian(160, 160, 102, textAngle);

            return (
              <g key={segment.id}>
                {/* Wedge path */}
                <path
                  d={pathD}
                  fill={theme.fill}
                  stroke="#a6875c"
                  strokeWidth="1.2"
                  strokeOpacity="0.4"
                />

                {/* Text label with exact contrast */}
                <g transform={`translate(${textPos.x}, ${textPos.y}) rotate(${textAngle})`}>
                  <text
                    x="0"
                    y="0"
                    fill={theme.text}
                    fontSize={numSegments > 6 ? "9.5" : "11"}
                    fontWeight="700"
                    fontFamily="inherit"
                    letterSpacing="0.06em"
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform="rotate(90)"
                    style={{ textTransform: "uppercase" }}
                  >
                    {segment.label}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Central Decorative Hub */}
          <circle cx="160" cy="160" r="32" fill="url(#centerHubGradient)" filter="url(#hubShadow)" />
          <circle cx="160" cy="160" r="28" fill="none" stroke="#fbfaf8" strokeWidth="1.5" strokeOpacity="0.6" />
          <polygon
            points="160,146 163.5,156.5 174,160 163.5,163.5 160,174 156.5,163.5 146,160 156.5,156.5"
            fill="#fbfaf8"
            opacity="0.95"
          />
        </svg>

        {/* Static Diamond Marker Beads on Bezel */}
        <div className="pointer-events-none absolute inset-0">
          {bezelBeads.map((bead) => (
            <span
              key={bead.id}
              className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a6875c] shadow-[0_0_2px_rgba(255,255,255,0.8)]"
              style={{
                left: `${(bead.x / 320) * 100}%`,
                top: `${(bead.y / 320) * 100}%`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
