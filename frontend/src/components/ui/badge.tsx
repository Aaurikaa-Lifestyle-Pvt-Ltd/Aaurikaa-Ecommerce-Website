import type { ProductBadge } from "@/types/commerce";
import { cn } from "@/lib/cn";

const badgeConfig: Record<ProductBadge, { label: string; className: string }> =
  {
    new: { label: "New", className: "bg-primary text-primary-foreground" },
    bestseller: {
      label: "Bestseller",
      className: "bg-accent text-accent-foreground",
    },
    trending: {
      label: "Trending",
      className: "bg-surface text-foreground border border-border",
    },
    sale: { label: "Sale", className: "bg-sale text-white" },
    "sold-out": {
      label: "Sold Out",
      className: "bg-muted text-muted-foreground",
    },
  };

interface BadgeProps {
  badge: ProductBadge;
  className?: string;
}

/** Restrained product badge (brief §15). Normally show only one per card. */
export function Badge({ badge, className }: BadgeProps) {
  const { label, className: variant } = badgeConfig[badge];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
        variant,
        className,
      )}
    >
      {label}
    </span>
  );
}
