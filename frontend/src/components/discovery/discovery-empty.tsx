import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

interface DiscoveryEmptyProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
}

/** Empty / no-results state for discovery surfaces. */
export function DiscoveryEmpty({
  title,
  description,
  action,
}: DiscoveryEmptyProps) {
  return (
    <div className="rounded-card border border-border/70 bg-surface/50 backdrop-blur-xs px-6 py-16 text-center sm:px-12 sm:py-24 max-w-2xl mx-auto shadow-soft">
      {/* Small luxury graphic accent */}
      <div className="mb-4 text-[10px] font-semibold tracking-[0.25em] uppercase text-accent">
        AAURIKAA
      </div>

      <h2 className="font-serif text-xl sm:text-2xl font-normal tracking-wide text-foreground">
        {title}
      </h2>

      {/* Subtle gold line */}
      <div className="my-5 h-[1px] w-12 bg-accent/35 mx-auto" />

      {description ? (
        <p className="mx-auto max-w-md text-xs sm:text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {action ? (
        <div className="mt-8">
          <ButtonLink
            href={action.href}
            variant="outline"
            size="md"
            className="border-accent text-accent hover:bg-accent hover:text-white transition-all duration-300"
          >
            {action.label}
          </ButtonLink>
        </div>
      ) : (
        <p className="mt-6 text-xs text-muted-foreground">
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Return home
          </Link>
        </p>
      )}
    </div>
  );
}
