import Link from "next/link";
import { cn } from "@/lib/cn";

interface SectionHeadingProps {
  title: string;
  eyebrow?: string;
  align?: "left" | "center";
  cta?: { label: string; href: string };
  className?: string;
  /** Heading level for correct document outline. */
  as?: "h2" | "h3";
}

/**
 * Editorial section header: optional eyebrow kicker, a serif display title,
 * and an optional inline CTA (e.g. "Shop All →"). Reused across homepage and
 * listing sections so headings stay consistent (brief §14/§29).
 */
export function SectionHeading({
  title,
  eyebrow,
  align = "left",
  cta,
  className,
  as: Heading = "h2",
}: SectionHeadingProps) {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "flex gap-4",
        centered
          ? "flex-col items-center text-center"
          : "flex-wrap items-end justify-between",
        className,
      )}
    >
      <div className={cn(centered && "flex flex-col items-center")}>
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <Heading className="font-serif text-2xl leading-tight tracking-tight sm:text-3xl">
          {title}
        </Heading>
      </div>
      {cta ? (
        <Link
          href={cta.href}
          className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {cta.label} <span aria-hidden>→</span>
        </Link>
      ) : null}
    </div>
  );
}
