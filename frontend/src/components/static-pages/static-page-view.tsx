import { Suspense } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { EnquiryForm } from "@/components/support/enquiry-form";
import { WellWisherForm } from "@/components/support/well-wisher-form";
import { StaticPageZones } from "./zone-renderer";
import type { PublicStaticPage } from "@/lib/api/static-pages";
import { hasRenderableZones } from "@/lib/static-pages/zone-types";

type StaticPageViewProps = {
  title: string;
  page: PublicStaticPage | null;
  /** Optional pageKey from the route registry (preferred for empty CMS pages). */
  pageKey?: string;
};

function isContactPage(
  page: PublicStaticPage | null,
  title: string,
  pageKey?: string,
): boolean {
  if (pageKey === "contact") return true;
  if (page?.pageKey === "contact") return true;
  if (page?.slug === "contact") return true;
  if (!page && /^contact(\s+us)?$/i.test(title.trim())) return true;
  return false;
}

function isWellWisherPage(
  page: PublicStaticPage | null,
  pageKey?: string,
): boolean {
  if (pageKey === "well-wisher-suggestions") return true;
  if (page?.pageKey === "well-wisher-suggestions") return true;
  const slug = page?.slug?.replace(/^\/+/, "") ?? "";
  return slug === "well-wisher-suggestions" || slug === "well-wisher" || slug === "feedback";
}

/**
 * Renders published CMS zones only. Never invents legal/policy body copy.
 * Unpublished / missing → clean unavailable state with care links.
 */
export function StaticPageView({ title, page, pageKey }: StaticPageViewProps) {
  const zones = page?.zones ?? {};
  const ready = Boolean(page) && hasRenderableZones(zones);
  const contact = isContactPage(page, title, pageKey);
  const wellWisher = isWellWisherPage(page, pageKey);

  return (
    <Container className="py-14 sm:py-20">
      <header className="mb-12">
        <p className="eyebrow mb-3">AAURIKAA</p>
        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          {title}
        </h1>
      </header>

      {!ready && !contact && !wellWisher ? (
        <div className="max-w-xl space-y-4 border border-border bg-surface px-6 py-10">
          <p className="font-medium text-foreground">Content coming soon</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This page is not published yet. Please check back later, or use the
            links below if you need help in the meantime.
          </p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/contact"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Contact us
              </Link>
            </li>
            <li>
              <Link
                href="/account/orders"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                View your orders
              </Link>
            </li>
          </ul>
        </div>
      ) : null}

      {ready ? (
        <div className="w-full">
          <StaticPageZones zones={zones} />
        </div>
      ) : null}

      {contact ? (
        <div
          className={
            ready ? "mt-14 border-t border-border pt-12" : "max-w-xl"
          }
        >
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground">Loading enquiry form…</p>
            }
          >
            <EnquiryForm />
          </Suspense>
        </div>
      ) : null}

      {wellWisher ? (
        <div
          className={
            ready ? "mt-14 border-t border-border pt-12" : "max-w-xl"
          }
        >
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground">Loading feedback form…</p>
            }
          >
            <WellWisherForm />
          </Suspense>
        </div>
      ) : null}
    </Container>
  );
}
