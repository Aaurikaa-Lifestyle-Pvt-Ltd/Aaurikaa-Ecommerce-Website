import Image from "next/image";
import Link from "next/link";
import type { ProductImage } from "@/types/commerce";
import { Container } from "@/components/ui/container";
import { DiscoveryHeader, type DiscoveryCrumb } from "./discovery-header";

export interface CatalogueIndexItem {
  id: string;
  name: string;
  href: string;
  image: ProductImage;
  description?: string;
}

interface CatalogueIndexProps {
  title: string;
  eyebrow?: string;
  description?: string;
  crumbs?: DiscoveryCrumb[];
  items: CatalogueIndexItem[];
  emptyMessage?: string;
}

// 2-col mobile/tablet, 4-col from lg — match grid, not full viewport.
const IMAGE_SIZES =
  "(min-width: 1024px) 23vw, (min-width: 640px) 45vw, 46vw";

/**
 * Visual index for category or collection entry points.
 * Distinct from ProductDiscovery (which lists products).
 */
export function CatalogueIndex({
  title,
  eyebrow,
  description,
  crumbs,
  items,
  emptyMessage = "Nothing to browse yet.",
}: CatalogueIndexProps) {
  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <DiscoveryHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          crumbs={crumbs}
        />

        {items.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="group block">
                  <div className="relative aspect-3/4 overflow-hidden rounded-card bg-muted">
                    <Image
                      src={item.image.src}
                      alt={item.image.alt}
                      fill
                      sizes={IMAGE_SIZES}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                    <div
                      className="absolute inset-0 bg-linear-to-t from-black/50 via-black/10 to-transparent"
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
                      <h2 className="text-base font-medium text-white sm:text-lg">
                        {item.name}
                      </h2>
                      {item.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-white/80">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </div>
  );
}
