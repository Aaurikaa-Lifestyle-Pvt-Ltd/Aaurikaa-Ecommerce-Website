import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getProductBySlug,
  getProducts,
  getRelatedProducts,
  getTaxonomyPath,
} from "@/lib/data";
import { isApiCatalogue } from "@/lib/api/config";
import {
  ProductDetails,
  ProductGallery,
  ProductPurchase,
  ProductShowcase,
} from "@/components/product";
import { ProductReviews } from "@/components/product/product-reviews";
import { siteConfig } from "@/config/site";
import { buildTaxonomyHref } from "@/lib/taxonomy";

interface PageProps {
  params: Promise<{ slug: string }>;
}

type Crumb = { label: string; href?: string };

export async function generateStaticParams() {
  if (isApiCatalogue()) return [];
  const products = await getProducts();
  return products.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) {
    return { title: "Product not found" };
  }
  return {
    title: product.seoTitle?.trim() || product.name,
    description:
      product.seoDescription?.trim() ||
      product.shortDescription ||
      product.description ||
      `Shop ${product.name} at ${siteConfig.name}.`,
  };
}

async function resolvePdpBreadcrumbs(product: {
  name: string;
  categoryIds?: string[];
  subcategorySlug?: string;
  childCategorySlug?: string;
}): Promise<Crumb[]> {
  const categorySlug = product.categoryIds?.[0];
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }];

  if (!categorySlug) {
    crumbs.push({ label: product.name });
    return crumbs;
  }

  const candidates: string[][] = [
    [categorySlug, product.subcategorySlug, product.childCategorySlug],
    [categorySlug, product.subcategorySlug],
    [categorySlug],
  ]
    .map((parts) => parts.filter((s): s is string => Boolean(s)))
    .filter((parts, index, all) => {
      const key = parts.join("/");
      return parts.length > 0 && all.findIndex((p) => p.join("/") === key) === index;
    });

  let taxonomy: Awaited<ReturnType<typeof getTaxonomyPath>> = null;
  for (const segments of candidates) {
    taxonomy = await getTaxonomyPath(segments);
    if (taxonomy) break;
  }

  if (taxonomy?.category) {
    crumbs.push({
      label: taxonomy.category.name,
      href: buildTaxonomyHref(taxonomy.category.slug),
    });
    if (taxonomy.subcategory) {
      crumbs.push({
        label: taxonomy.subcategory.name,
        href: buildTaxonomyHref(
          taxonomy.category.slug,
          taxonomy.subcategory.slug,
        ),
      });
    }
    if (taxonomy.childCategory) {
      crumbs.push({
        label: taxonomy.childCategory.name,
        href: buildTaxonomyHref(
          taxonomy.category.slug,
          taxonomy.subcategory?.slug,
          taxonomy.childCategory.slug,
        ),
      });
    }
  } else {
    crumbs.push({
      label: categorySlug,
      href: buildTaxonomyHref(categorySlug),
    });
  }

  crumbs.push({ label: product.name });
  return crumbs;
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const related = await getRelatedProducts(product, 4);
  const primaryCategorySlug = product.categoryIds?.[0];
  const breadcrumbs = await resolvePdpBreadcrumbs(product);

  return (
    <div className="pb-24 pt-6 sm:pt-8 lg:pb-16 lg:pt-10">
      <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-5 lg:px-6 xl:px-8">
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 ? <span aria-hidden>/</span> : null}
                  {crumb.href && !last ? (
                    <Link
                      href={crumb.href}
                      className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={last ? "text-foreground" : undefined}
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

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] xl:gap-10">
          <ProductGallery product={product} />
          <div className="min-w-0">
            <ProductPurchase product={product} />
            <ProductDetails product={product} className="mt-10" />
          </div>
        </div>

        <ProductReviews
          productId={product.id}
          catalogueAvgRating={product.avgRating}
          catalogueReviewCount={product.reviewCount}
          className="mt-14 sm:mt-20"
        />
      </div>

      {related.length > 0 ? (
        <div className="mt-6 border-t border-border">
          <ProductShowcase
            title="You may also like"
            eyebrow="Related"
            products={related}
            variant="grid"
            cta={
              primaryCategorySlug
                ? {
                    label: "Shop category",
                    href: buildTaxonomyHref(primaryCategorySlug),
                  }
                : { label: "Continue shopping", href: "/categories" }
            }
          />
        </div>
      ) : null}
    </div>
  );
}
