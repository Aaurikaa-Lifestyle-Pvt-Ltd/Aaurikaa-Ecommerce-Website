import Image from "next/image";
import Link from "next/link";
import { TipTapRenderer } from "@/lib/static-pages/tiptap";
import { sanitizeActionHref } from "@/lib/static-pages/sanitize-href";
import {
  isEmptyZoneValue,
  orderedZoneEntries,
  resolveZoneType,
  type StaticZoneType,
} from "@/lib/static-pages/zone-types";
import { buttonClasses } from "@/components/ui/button";

type MediaRef = {
  mediaId?: string;
  url?: string;
  alt?: string;
  caption?: string;
  imageUrl?: string;
  imageAlt?: string;
};

function ActionLink({
  href,
  label,
  variant = "outline",
}: {
  href: string;
  label: string;
  variant?: "outline" | "primary";
}) {
  const safe = sanitizeActionHref(href);
  if (!safe || !label.trim()) return null;
  const external = /^https?:/i.test(safe) || safe.startsWith("mailto:") || safe.startsWith("tel:");
  const className = buttonClasses(variant, "sm");
  if (external) {
    return (
      <a
        href={safe}
        className={className}
        {...(safe.startsWith("http")
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {label}
      </a>
    );
  }
  return (
    <Link href={safe} className={className}>
      {label}
    </Link>
  );
}

function resolveMedia(value: unknown): MediaRef | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const media =
    obj.media && typeof obj.media === "object"
      ? (obj.media as MediaRef)
      : (obj as MediaRef);
  const url = String(media.url ?? media.imageUrl ?? "").trim();
  if (!url) return null;
  return {
    mediaId: media.mediaId,
    url,
    alt: String(media.alt ?? media.imageAlt ?? "").trim(),
    caption: String(media.caption ?? "").trim(),
  };
}

function MediaFigure({
  media,
  className,
  priority = false,
}: {
  media: MediaRef;
  className?: string;
  priority?: boolean;
}) {
  if (!media.url) return null;
  return (
    <figure className={className}>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
        <Image
          src={media.url}
          alt={media.alt || ""}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 100vw, 1280px"
          priority={priority}
          unoptimized={/^https?:\/\//i.test(media.url)}
        />
      </div>
      {media.caption ? (
        <figcaption className="mt-2 text-sm text-muted-foreground">{media.caption}</figcaption>
      ) : null}
    </figure>
  );
}

function PlainTextZone({ value }: { value: unknown }) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return <p className="text-base leading-relaxed text-muted-foreground">{text}</p>;
}

function SectionListZone({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return (
    <div className="space-y-10">
      {value.map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const item = section as { title?: string; bodyRichText?: unknown; body?: unknown };
        const title = String(item.title ?? "").trim();
        const body = item.bodyRichText ?? item.body;
        return (
          <section key={`section-${index}`} className="space-y-3">
            {title ? (
              <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
            ) : null}
            <TipTapRenderer content={body} />
          </section>
        );
      })}
    </div>
  );
}

function FaqListZone({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return (
    <div className="divide-y divide-border border-y border-border">
      {value.map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as { category?: string; q?: string; a?: string };
        const q = String(item.q ?? "").trim();
        const a = String(item.a ?? "").trim();
        if (!q && !a) return null;
        return (
          <details key={`faq-${index}`} className="group py-5">
            <summary className="cursor-pointer list-none font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-start justify-between gap-4">
                <span>
                  {item.category ? (
                    <span className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {item.category}
                    </span>
                  ) : null}
                  {q}
                </span>
                <span className="text-muted-foreground transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </span>
            </summary>
            {a ? (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

function ContactCardZone({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const card = value as {
    heading?: string;
    intro?: string;
    organizationName?: string;
    phone?: string;
    email?: string;
    addressLines?: unknown;
    buttonLabel?: string;
    buttonHref?: string;
  };
  const heading = String(card.heading ?? "").trim();
  if (!heading) return null;
  const lines = Array.isArray(card.addressLines)
    ? card.addressLines.map((l) => String(l).trim()).filter(Boolean)
    : [];
  return (
    <aside className="space-y-3 border border-border bg-surface p-6">
      <h2 className="font-serif text-xl tracking-tight">{heading}</h2>
      {card.intro ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{card.intro}</p>
      ) : null}
      {card.organizationName ? (
        <p className="text-sm font-medium">{card.organizationName}</p>
      ) : null}
      <ul className="space-y-1 text-sm text-muted-foreground">
        {card.phone ? <li>{card.phone}</li> : null}
        {card.email ? <li>{card.email}</li> : null}
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {card.buttonLabel && card.buttonHref ? (
        <div className="pt-2">
          <ActionLink href={card.buttonHref} label={card.buttonLabel} />
        </div>
      ) : null}
    </aside>
  );
}

function CtaCardZone({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const card = value as {
    heading?: string;
    description?: string;
    buttonLabel?: string;
    buttonHref?: string;
  };
  const heading = String(card.heading ?? "").trim();
  if (!heading) return null;
  return (
    <aside className="space-y-4 border border-border bg-muted/30 px-6 py-8">
      <h2 className="font-serif text-2xl tracking-tight">{heading}</h2>
      {card.description ? (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">{card.description}</p>
      ) : null}
      {card.buttonLabel && card.buttonHref ? (
        <ActionLink href={card.buttonHref} label={card.buttonLabel} variant="primary" />
      ) : null}
    </aside>
  );
}

function SupportPanelZone({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const panel = value as {
    heading?: string;
    description?: string;
    actions?: Array<{ label?: string; href?: string }>;
  };
  const heading = String(panel.heading ?? "").trim();
  if (!heading) return null;
  const actions = Array.isArray(panel.actions) ? panel.actions : [];
  return (
    <aside className="space-y-4 border border-border p-6">
      <h2 className="font-serif text-xl tracking-tight">{heading}</h2>
      {panel.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{panel.description}</p>
      ) : null}
      {actions.length ? (
        <div className="flex flex-wrap gap-3">
          {actions.map((action, index) => (
            <ActionLink
              key={`action-${index}`}
              href={String(action.href ?? "")}
              label={String(action.label ?? "")}
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function LinkCardListZone({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {value.map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as { title?: string; description?: string; href?: string };
        const title = String(item.title ?? "").trim();
        const href = sanitizeActionHref(item.href);
        if (!title || !href) return null;
        const external = /^https?:/i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
        const body = (
          <>
            <p className="font-medium text-foreground">{title}</p>
            {item.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            ) : null}
          </>
        );
        return (
          <li key={`link-${index}`} className="border border-border p-5 transition-colors hover:bg-muted/40">
            {external ? (
              <a
                href={href}
                className="block"
                {...(href.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {body}
              </a>
            ) : (
              <Link href={href} className="block">
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TestimonialListZone({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return (
    <ul className="grid gap-6 md:grid-cols-2">
      {value.map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as { name?: string; role?: string; comment?: string };
        const name = String(item.name ?? "").trim();
        const comment = String(item.comment ?? "").trim();
        if (!name || !comment) return null;
        return (
          <li key={`t-${index}`} className="space-y-3 border-t border-border pt-5">
            <p className="text-sm leading-relaxed text-muted-foreground">&ldquo;{comment}&rdquo;</p>
            <p className="text-sm font-medium">
              {name}
              {item.role ? (
                <span className="font-normal text-muted-foreground"> — {item.role}</span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function VideoTutorialListZone({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return (
    <ul className="space-y-3">
      {value.map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as { title?: string; url?: string };
        const title = String(item.title ?? "").trim();
        const url = sanitizeActionHref(item.url);
        if (!title || !url || !url.startsWith("https://")) return null;
        return (
          <li key={`v-${index}`}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              {title}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function NoticeBannerZone({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const banner = value as { heading?: string; description?: string };
  const heading = String(banner.heading ?? "").trim();
  if (!heading) return null;
  return (
    <aside className="border border-border bg-muted/30 px-5 py-4">
      <p className="font-medium">{heading}</p>
      {banner.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{banner.description}</p>
      ) : null}
    </aside>
  );
}

function HeroBannerZone({ value, priority = false }: { value: unknown; priority?: boolean }) {
  if (!value || typeof value !== "object") return null;
  const hero = value as {
    title?: string;
    subcopy?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  const media = resolveMedia(value);
  const title = String(hero.title ?? "").trim();
  const subcopy = String(hero.subcopy ?? "").trim();
  if (!media && !title && !subcopy) return null;

  return (
    <section className="space-y-6">
      {media ? <MediaFigure media={media} priority={priority} className="w-full" /> : null}
      {(title || subcopy || (hero.ctaLabel && hero.ctaHref)) && (
        <div className="max-w-2xl space-y-4">
          {title ? (
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">{title}</h2>
          ) : null}
          {subcopy ? (
            <p className="text-base leading-relaxed text-muted-foreground">{subcopy}</p>
          ) : null}
          {hero.ctaLabel && hero.ctaHref ? (
            <ActionLink href={hero.ctaHref} label={hero.ctaLabel} variant="primary" />
          ) : null}
        </div>
      )}
    </section>
  );
}

function ImageZone({ value }: { value: unknown }) {
  const media = resolveMedia(value);
  if (!media) return null;
  return <MediaFigure media={media} />;
}

function ImageTextZone({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return null;
  const block = value as {
    bodyRichText?: unknown;
    body?: unknown;
    imagePosition?: string;
  };
  const media = resolveMedia(value);
  const body = block.bodyRichText ?? block.body;
  const imageRight = String(block.imagePosition ?? "left").toLowerCase() === "right";
  if (!media && !body) return null;

  return (
    <section
      className={`grid items-start gap-8 md:grid-cols-2 ${imageRight ? "" : ""}`}
    >
      <div className={imageRight ? "md:order-2" : ""}>
        {media ? <MediaFigure media={media} /> : null}
      </div>
      <div className={imageRight ? "md:order-1" : ""}>
        <TipTapRenderer content={body} />
      </div>
    </section>
  );
}

function CardGridZone({ value }: { value: unknown }) {
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  if (!items.length) return null;

  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((entry, index) => {
        if (!entry || typeof entry !== "object") return null;
        const item = entry as {
          title?: string;
          description?: string;
          href?: string;
          media?: MediaRef;
        };
        const title = String(item.title ?? "").trim();
        if (!title) return null;
        const media = resolveMedia(item);
        const href = sanitizeActionHref(item.href);
        const inner = (
          <>
            {media ? (
              <div className="relative mb-4 aspect-[4/3] overflow-hidden bg-muted/40">
                <Image
                  src={media.url!}
                  alt={media.alt || title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 320px"
                  unoptimized={/^https?:\/\//i.test(media.url!)}
                />
              </div>
            ) : null}
            <p className="font-medium text-foreground">{title}</p>
            {item.description ? (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            ) : null}
          </>
        );
        return (
          <li key={`card-${index}`} className="border border-border p-4 transition-colors hover:bg-muted/30">
            {href ? (
              /^https?:/i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:") ? (
                <a
                  href={href}
                  className="block"
                  {...(href.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {inner}
                </a>
              ) : (
                <Link href={href} className="block">
                  {inner}
                </Link>
              )
            ) : (
              <div>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OrderedSectionsZone({ value }: { value: unknown }) {
  if (!Array.isArray(value) || !value.length) return null;
  return (
    <div className="space-y-14">
      {value.map((section, index) => {
        if (!section || typeof section !== "object") return null;
        const item = section as Record<string, unknown>;
        const type = String(item.type ?? "").trim();
        if (!type) return null;
        const key = String(item.id ?? `ordered-${index}`);

        if (type === "richText") {
          const heading = String(item.heading ?? item.title ?? "").trim();
          const body = item.bodyRichText ?? item.body;
          return (
            <section key={key} className="space-y-3">
              {heading ? (
                <h2 className="font-serif text-2xl tracking-tight">{heading}</h2>
              ) : null}
              <TipTapRenderer content={body} />
            </section>
          );
        }

        if (type === "faqList") {
          const list = item.items ?? item.faqItems ?? item.value;
          return (
            <div key={key}>
              <FaqListZone value={list} />
            </div>
          );
        }

        if (type === "cardGrid") {
          const list = item.items ?? item.cards ?? item;
          return (
            <div key={key}>
              <CardGridZone value={list} />
            </div>
          );
        }

        if (type === "heroBanner") {
          return (
            <div key={key}>
              <HeroBannerZone value={item} />
            </div>
          );
        }

        if (type === "image") {
          return (
            <div key={key}>
              <ImageZone value={item} />
            </div>
          );
        }

        if (type === "imageText") {
          return (
            <div key={key}>
              <ImageTextZone value={item} />
            </div>
          );
        }

        if (type === "cta" || type === "ctaCard") {
          return (
            <div key={key}>
              <CtaCardZone value={item} />
            </div>
          );
        }

        if (type === "contactCard") {
          return (
            <div key={key}>
              <ContactCardZone value={item} />
            </div>
          );
        }

        if (type === "supportPanel") {
          return (
            <div key={key}>
              <SupportPanelZone value={item} />
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

function renderZone(type: StaticZoneType, value: unknown, options?: { priority?: boolean }) {
  switch (type) {
    case "plainText":
      return <PlainTextZone value={value} />;
    case "richText":
      return <TipTapRenderer content={value} />;
    case "sectionList":
      return <SectionListZone value={value} />;
    case "faqList":
      return <FaqListZone value={value} />;
    case "contactCard":
      return <ContactCardZone value={value} />;
    case "ctaCard":
      return <CtaCardZone value={value} />;
    case "supportPanel":
      return <SupportPanelZone value={value} />;
    case "linkCardList":
      return <LinkCardListZone value={value} />;
    case "testimonialList":
      return <TestimonialListZone value={value} />;
    case "videoTutorialList":
      return <VideoTutorialListZone value={value} />;
    case "noticeBanner":
      return <NoticeBannerZone value={value} />;
    case "heroBanner":
      return <HeroBannerZone value={value} priority={options?.priority} />;
    case "image":
      return <ImageZone value={value} />;
    case "imageText":
      return <ImageTextZone value={value} />;
    case "cardGrid":
      return <CardGridZone value={value} />;
    case "orderedSections":
      return <OrderedSectionsZone value={value} />;
    default:
      return null;
  }
}

export function StaticPageZones({ zones }: { zones: Record<string, unknown> }) {
  const entries = orderedZoneEntries(zones);
  const nodes = entries
    .map(([id, value], index) => {
      const type = resolveZoneType(id, value);
      if (!type || isEmptyZoneValue(type, value)) return null;
      const rendered = renderZone(type, value, { priority: index === 0 && type === "heroBanner" });
      if (!rendered) return null;
      return (
        <div key={id} className="space-y-4">
          {rendered}
        </div>
      );
    })
    .filter(Boolean);

  if (!nodes.length) return null;
  return <div className="space-y-12">{nodes}</div>;
}
