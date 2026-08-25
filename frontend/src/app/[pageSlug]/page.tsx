import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StaticPageView } from "@/components/static-pages/static-page-view";
import { fetchPublishedStaticPage } from "@/lib/api/static-pages";
import {
  canonicalPathForPageKey,
  getStaticPageRoute,
  listPublicStaticSlugs,
  resolvePageKeyFromSlug,
} from "@/lib/static-pages/registry";

interface PageProps {
  params: Promise<{ pageSlug: string }>;
}

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return listPublicStaticSlugs().map((pageSlug) => ({ pageSlug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { pageSlug } = await params;
  const pageKey = resolvePageKeyFromSlug(pageSlug);
  if (!pageKey) return { title: "Page" };

  const route = getStaticPageRoute(pageKey);
  const page = await fetchPublishedStaticPage(pageKey);
  const title = page?.seo?.title?.trim() || route?.title || "Page";
  const description = page?.seo?.metaDescription?.trim() || undefined;
  const canonical = canonicalPathForPageKey(pageKey) ?? undefined;

  return {
    title,
    description,
    alternates: canonical ? { canonical } : undefined,
  };
}

export default async function StaticPageBySlug({ params }: PageProps) {
  const { pageSlug } = await params;
  const pageKey = resolvePageKeyFromSlug(pageSlug);
  if (!pageKey) notFound();

  const route = getStaticPageRoute(pageKey);
  const page = await fetchPublishedStaticPage(pageKey);
  const title =
    page?.seo?.title?.trim() ||
    route?.title ||
    "Information";

  return <StaticPageView title={title} page={page} pageKey={pageKey} />;
}
