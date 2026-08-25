"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { TaxonomyNavItem } from "@/lib/api/categories";
import { cn } from "@/lib/cn";

interface TaxonomyNavCardsProps {
  label?: string;
  items: TaxonomyNavItem[];
  className?: string;
  parentName?: string;
  parentHref?: string;
}

export function TaxonomyNavCards({
  label,
  items,
  className,
  parentName = "All",
  parentHref,
}: TaxonomyNavCardsProps) {
  const pathname = usePathname();

  if (!items || items.length === 0) return null;

  // Determine active item
  const resolvedParentHref = parentHref || items[0]?.href?.split("/").slice(0, -1).join("/") || "/categories";
  const isParentActive = pathname === resolvedParentHref;

  return (
    <nav
      aria-label={label || "Subcategory navigation"}
      className={cn("mb-6 sm:mb-8", className)}
    >
      {label && (
        <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
          {label}
        </h2>
      )}

      {/* Horizontal scrollable track for pill buttons */}
      <div className="no-scrollbar -mx-4 flex overflow-x-auto px-4 pb-2.5 sm:mx-0 sm:px-0 sm:pb-0 sm:flex-wrap sm:gap-2.5">
        <ul className="flex items-center gap-2 sm:flex-wrap sm:gap-2">
          {/* "All" button */}
          <li>
            <Link
              href={resolvedParentHref}
              className={cn(
                "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-5 text-xs font-semibold tracking-wide transition-all duration-300 border",
                isParentActive
                  ? "bg-primary text-primary-foreground border-primary shadow-soft"
                  : "bg-surface text-foreground border-border hover:bg-muted hover:border-foreground/30"
              )}
            >
              {parentName.startsWith("All") ? parentName : `All ${parentName}`}
            </Link>
          </li>

          {/* Subcategory buttons */}
          {items.map((item) => {
            const isActive = pathname === item.href;

            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-5 text-xs font-semibold tracking-wide transition-all duration-300 border",
                    isActive
                      ? "bg-primary text-primary-foreground border-primary shadow-soft"
                      : "bg-surface text-foreground border-border hover:bg-muted hover:border-foreground/30"
                  )}
                >
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
