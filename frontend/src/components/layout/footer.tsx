import Image from "next/image";
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
import {
  IconFacebook,
  IconGlobe,
  IconInstagram,
  IconPinterest,
  IconTwitter,
  IconWhatsApp,
  IconYouTube,
} from "@/components/ui/icons";

function SocialIcon({
  platform,
  className = "h-5 w-5",
}: {
  platform: string;
  className?: string;
}) {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return <IconInstagram className={className} />;
  if (p.includes("facebook")) return <IconFacebook className={className} />;
  if (p.includes("whatsapp") || p.includes("wa.me")) return <IconWhatsApp className={className} />;
  if (p.includes("youtube")) return <IconYouTube className={className} />;
  if (p.includes("twitter") || p.includes("x")) return <IconTwitter className={className} />;
  if (p.includes("pinterest")) return <IconPinterest className={className} />;
  return <IconGlobe className={className} />;
}

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
  const copyrightLine =
    footer?.copyright?.trim() ||
    `© ${year} ${companyName}. All rights reserved.`;

  const detailLines = [
    footer?.address?.trim(),
    footer?.phone?.trim(),
    footer?.email?.trim(),
    footer?.gstin?.trim() ? `GSTIN: ${footer.gstin.trim()}` : "",
    footer?.workingHours1?.trim(),
    footer?.workingHours2?.trim(),
  ].filter(Boolean) as string[];

  const shopGroup = groups.find((g) => /^shop/i.test(g.title)) || groups[0];
  const careGroup =
    groups.find((g) => /care|support|service/i.test(g.title)) ||
    (groups.length > 1 && groups[1] !== shopGroup ? groups[1] : null);
  const otherGroups = groups.filter(
    (g) => g !== shopGroup && g !== careGroup
  );

  return (
    <footer className="w-full mt-8 border-t border-primary-foreground/10 bg-primary text-primary-foreground [&_.eyebrow]:text-primary-foreground/55">
      <Container>
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 py-16 sm:gap-x-8 md:grid-cols-4 md:gap-8 lg:grid-cols-4">
          {/* Column 1: BRAND */}
          <div className="col-span-2 flex flex-col md:col-span-4 lg:col-span-1">
            <Link
              href="/"
              className="inline-block transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${companyName} Home`}
            >
              <Image
                src="/images/logo/Aaurikaa logo .png"
                alt={companyName}
                width={380}
                height={220}
                className="h-40 w-auto max-w-full object-contain object-left sm:h-48 lg:h-52"
                priority={false}
              />
            </Link>
            {detailLines.length > 0 ? (
              <ul className="mt-6 max-w-xs space-y-1.5 text-sm text-primary-foreground/55">
                {detailLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Column 2: SHOP */}
          {shopGroup ? (
            <nav aria-label={shopGroup.title} className="col-span-1">
              <p className="eyebrow mb-4">{shopGroup.title}</p>
              <ul className="flex flex-col gap-3">
                {shopGroup.links.map((link) => (
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
          ) : null}

          {/* Column 3: CUSTOMER CARE */}
          {careGroup ? (
            <nav aria-label={careGroup.title} className="col-span-1">
              <p className="eyebrow mb-4">{careGroup.title}</p>
              <ul className="flex flex-col gap-3">
                {careGroup.links.map((link) => (
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
          ) : null}

          {/* Column 4: ABOUT / LEGAL */}
          {otherGroups.length > 0 ? (
            <div className="col-span-2 grid grid-cols-2 gap-6 sm:gap-8 md:col-span-2 lg:col-span-1 lg:flex lg:flex-col lg:gap-6">
              {otherGroups.map((group) => (
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
          ) : null}
        </div>

        {/* Footer bottom bar */}
        <div className="flex flex-col gap-4 border-t border-primary-foreground/10 py-6 text-xs text-primary-foreground/55 sm:flex-row sm:items-center sm:justify-between">
          <p>{copyrightLine}</p>
          {social.length > 0 ? (
            <div className="flex items-center gap-4">
              {social.map((s) => (
                <a
                  key={`${s.label}-${s.href}`}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-primary-foreground/60 transition-transform transition-colors hover:scale-110 hover:text-primary-foreground"
                >
                  <SocialIcon platform={s.label} className="h-5 w-5" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </Container>
    </footer>
  );
}


