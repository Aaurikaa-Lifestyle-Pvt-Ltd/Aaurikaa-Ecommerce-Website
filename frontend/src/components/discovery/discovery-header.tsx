import Image from "next/image";
import Link from "next/link";
import type { ProductImage } from "@/types/commerce";
import { cn } from "@/lib/cn";

export interface DiscoveryCrumb {
  label: string;
  href?: string;
}

interface DiscoveryHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  image?: ProductImage;
  /** Result count shown under the title when products are present. */
  resultCount?: number;
  crumbs?: DiscoveryCrumb[];
  className?: string;
}

/**
 * Listing / search page header — one job: name the surface and orient the shopper.
 */
export function DiscoveryHeader({
  eyebrow,
  title,
  description,
  image,
  resultCount,
  crumbs,
  className,
}: DiscoveryHeaderProps) {
  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex flex-wrap items-center text-[10px] uppercase tracking-[0.16em] text-muted-foreground/90">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center">
                  {index > 0 ? (
                    <span aria-hidden className="mx-2.5 text-muted-foreground/30 select-none">
                      /
                    </span>
                  ) : null}
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="transition-colors hover:text-accent"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={cn(last && "text-foreground font-medium")}
                      aria-current={last ? "page" : undefined}
                    >
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div
        className={cn(
          "flex gap-4 sm:gap-6",
          image?.src ? "items-center" : "items-start"
        )}
      >
        {image?.src ? (
          <div className="relative aspect-square w-20 sm:w-28 shrink-0 overflow-hidden rounded-card border border-border/40 bg-muted shadow-soft">
            <Image
              src={image.src}
              alt={image.alt || title}
              fill
              sizes="(min-width: 640px) 112px, 80px"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent mb-1.5">
              {eyebrow}
            </p>
          ) : null}

          <h1 className="font-serif text-2xl font-normal leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {title}
          </h1>

          {description ? (
            <p className="mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}

          {typeof resultCount === "number" ? (
            <p className="mt-3 text-xs tracking-wider text-muted-foreground sm:hidden">
              {resultCount === 0
                ? "No products"
                : resultCount === 1
                  ? "1 product"
                  : `${resultCount} products`}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
