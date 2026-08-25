import Link from "next/link";
import { cn } from "@/lib/cn";

export type TaxonomyNavChipItem = {
  id: string;
  name: string;
  href: string;
};

interface TaxonomyNavChipsProps {
  label?: string;
  items: TaxonomyNavChipItem[];
  className?: string;
}

/**
 * Next-level taxonomy navigation — chips linking to nested category paths.
 */
export function TaxonomyNavChips({
  label = "Browse",
  items,
  className,
}: TaxonomyNavChipsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label={label}
      className={cn("mb-6", className)}
    >
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="inline-flex h-9 items-center rounded-control border border-border bg-surface px-3.5 text-sm text-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
