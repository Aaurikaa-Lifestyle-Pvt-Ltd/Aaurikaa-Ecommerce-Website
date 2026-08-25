import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import {
  applyDiscoveryPage,
  hasActiveFilters,
  parseDiscoveryQuery,
} from "@/lib/discovery";
import { getLookBySlug, getLooks } from "@/lib/data";
import { ProductDiscovery } from "@/components/discovery";
import { siteConfig } from "@/config/site";
import { isApiCatalogue } from "@/lib/api/config";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamicParams = true;

export async function generateStaticParams() {
  if (isApiCatalogue()) return [];
  try {
    const looks = await getLooks();
    return looks
      .map((look) => look.slug)
      .filter((slug): slug is string => Boolean(slug))
      .map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getLookBySlug(slug);
  if (!result) return { title: "Look" };
  return {
    title: result.look.title,
    description: result.look.description ?? `Shop the look at ${siteConfig.name}.`,
  };
}

export default async function LookDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const result = await getLookBySlug(slug);
  if (!result) notFound();

  const query = parseDiscoveryQuery(await searchParams);
  const page = applyDiscoveryPage(result.products, query);
  const filtered = hasActiveFilters(query);

  return (
    <div>
      <div className="relative mx-auto mt-8 aspect-4/5 max-w-5xl overflow-hidden rounded-card bg-muted sm:aspect-21/9">
        <Image
          src={result.look.image.src}
          alt={result.look.image.alt}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      </div>
      <ProductDiscovery
        eyebrow="Shop the Look"
        title={result.look.title}
        description={result.look.description}
        crumbs={[
          { label: "Home", href: "/" },
          { label: result.look.title },
        ]}
        products={page.products}
        totalCount={page.totalCount}
        totalPages={page.totalPages}
        currentPage={page.currentPage}
        query={query}
        empty={{
          title: filtered
            ? "No products match these filters"
            : "No products are linked to this look yet",
          description: filtered
            ? "Try clearing filters or adjusting sort."
            : "Associated products can be added when the catalogue is loaded.",
          action: filtered
            ? { label: "Clear filters", href: `/looks/${slug}` }
            : { label: "Back home", href: "/" },
        }}
      />
    </div>
  );
}
