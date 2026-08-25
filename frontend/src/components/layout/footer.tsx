import Link from "next/link";
import { siteConfig, type FooterGroup, type SocialLink } from "@/config/site";
import { Container } from "@/components/ui/container";
import {
  fetchPublicFooterSettings,
  footerHasUsableColumns,
  footerHasUsableSocial,
  type PublicFooterSettings,
} from "@/lib/api/site";
import { scrubFooterHref as scrubMarketplaceFooterHref } from "@/lib/static-pages/sanitize-href";

/** Map known broken care paths onto registry slugs. */
function remapCareHref(href: string): string {
  const [pathPart, query = ""] = href.split("?");
  const path = (pathPart ?? "").replace(/\/+$/, "") || "/";
  const suffix = query ? `?${query}` : "";
  const lower = path.toLowerCase();
  if (lower === "/help") return `/help-center${suffix}`;
  if (lower === "/delivery") return `/delivery-info${suffix}`;
  return href;
}

function scrubFooterHref(raw: unknown): string | null {
  const scrubbed = scrubMarketplaceFooterHref(raw);
  if (!scrubbed) return null;
  return remapCareHref(scrubbed);
}

/**
 * Footer (brief §24). Prefers SiteSettings footer when API returns columns/social;
 * falls back to siteConfig only when empty/unavailable. Does not invent legal copy.
 */
export async function Footer() {
  const year = new Date().getFullYear();
  let footer: PublicFooterSettings | null = null;
  try {
    footer = await fetchPublicFooterSettings();
  } catch {
    footer = null;
  }

  const groups: FooterGroup[] = footerHasUsableColumns(footer)
    ? (footer!.columns ?? [])
        .filter((col) => col?.title?.trim())
        .map((col) => ({
          title: col.title.trim(),
          links: (col.links ?? [])
            .map((link) => {
              const href = scrubFooterHref(link.url);
              const label = String(link.label ?? "").trim();
              if (!href || !label) return null;
              return { label, href };
            })
            .filter((link): link is { label: string; href: string } => link != null),
        }))
        .filter((col) => col.links.length > 0)
    : siteConfig.footerGroups.map((group) => ({
        ...group,
        links: group.links
          .map((link) => {
            const href = scrubFooterHref(link.href);
            if (!href) return null;
            return { label: link.label, href };
          })
          .filter((link): link is { label: string; href: string } => link != null),
      }));

  const social: SocialLink[] = footerHasUsableSocial(footer)
    ? (footer!.socialLinks ?? [])
        .filter((s) => s?.isEnabled !== false)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((s) => {
          const href = scrubFooterHref(s.url);
          const label = String(s.platform ?? "").trim() || "Social";
          if (!href) return null;
          return { label, href };
        })
        .filter((s): s is SocialLink => s != null)
    : siteConfig.social;

  const companyName =
    footer?.companyName?.trim() || siteConfig.name;
  const brandBlurb =
    footer?.text?.trim() || siteConfig.description;
  const copyrightLine =
    footer?.copyright?.trim() ||
    `© ${year} ${companyName}. All rights reserved.`;
  const tagline = siteConfig.tagline;

  const detailLines = [
    footer?.address?.trim(),
    footer?.phone?.trim(),
    footer?.email?.trim(),
    footer?.gstin?.trim() ? `GSTIN: ${footer.gstin.trim()}` : "",
    footer?.workingHours1?.trim(),
    footer?.workingHours2?.trim(),
  ].filter(Boolean) as string[];

  return (
    <footer className="mt-8 border-t border-primary-foreground/10 bg-primary text-primary-foreground [&_.eyebrow]:text-primary-foreground/55">
      <Container>
        <div className="grid grid-cols-2 gap-10 py-16 md:grid-cols-6 lg:gap-8">
          <div className="col-span-2">
            <p className="font-serif text-2xl tracking-tight">{companyName}</p>
            {brandBlurb ? (
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-primary-foreground/60">
                {brandBlurb}
              </p>
            ) : null}
            {detailLines.length > 0 ? (
              <ul className="mt-4 max-w-xs space-y-1 text-sm text-primary-foreground/55">
                {detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {social.length > 0 ? (
              <div className="mt-6">
                <p className="eyebrow mb-3">Connect</p>
                <ul className="flex flex-wrap gap-x-5 gap-y-2">
                  {social.map((s) => (
                    <li key={`${s.label}-${s.href}`}>
                      <a
                        href={s.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary-foreground/60 underline-offset-4 transition-colors hover:text-primary-foreground hover:underline"
                      >
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {groups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="eyebrow mb-4">{group.title}</p>
              <ul className="flex flex-col gap-3">
                {group.links.map((link) => (
                  <li key={`${link.label}-${link.href}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-primary-foreground/60 underline-offset-4 transition-colors hover:text-primary-foreground hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-primary-foreground/10 py-6 text-xs text-primary-foreground/55 sm:flex-row sm:items-center sm:justify-between">
          <p>{copyrightLine}</p>
          <p>{tagline}</p>
        </div>
      </Container>
    </footer>
  );
}
