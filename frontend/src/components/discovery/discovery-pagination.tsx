"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DiscoveryQuery } from "@/types/discovery";
import { buildDiscoverySearchParams } from "@/lib/discovery";
import { cn } from "@/lib/cn";

interface DiscoveryPaginationProps {
  query: DiscoveryQuery;
  currentPage: number;
  totalPages: number;
  className?: string;
}

/**
 * Lightweight prev/next pagination driven by the discovery URL query.
 */
export function DiscoveryPagination({
  query,
  currentPage,
  totalPages,
  className,
}: DiscoveryPaginationProps) {
  if (totalPages <= 1) return null;

  const pathname = usePathname();
  const prevHref =
    currentPage > 1
      ? `${pathname}${buildDiscoverySearchParams({ ...query, page: currentPage - 1 })}`
      : null;
  const nextHref =
    currentPage < totalPages
      ? `${pathname}${buildDiscoverySearchParams({ ...query, page: currentPage + 1 })}`
      : null;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex items-center justify-between gap-4 border-t border-border pt-6 text-sm",
        className,
      )}
    >
      {prevHref ? (
        <Link
          href={prevHref}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Previous
        </Link>
      ) : (
        <span className="text-muted-foreground/50">Previous</span>
      )}

      <p className="text-muted-foreground">
        Page {currentPage} of {totalPages}
      </p>

      {nextHref ? (
        <Link
          href={nextHref}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Next
        </Link>
      ) : (
        <span className="text-muted-foreground/50">Next</span>
      )}
    </nav>
  );
}
