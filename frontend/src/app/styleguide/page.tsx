import type { Metadata } from "next";
import type { ProductBadge } from "@/types/commerce";
import {
  Badge,
  Button,
  ButtonLink,
  Container,
  SectionHeading,
} from "@/components/ui";
import { ProductShowcase } from "@/components/product";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Style Guide",
  description: "Visual system foundation preview.",
};

const swatches: { name: string; token: string; className: string }[] = [
  { name: "background", token: "--background", className: "bg-background" },
  { name: "surface", token: "--surface", className: "bg-surface" },
  { name: "foreground", token: "--foreground", className: "bg-foreground" },
  { name: "muted", token: "--muted", className: "bg-muted" },
  {
    name: "muted-foreground",
    token: "--muted-foreground",
    className: "bg-muted-foreground",
  },
  { name: "border", token: "--border", className: "bg-border" },
  { name: "primary", token: "--primary", className: "bg-primary" },
  { name: "accent", token: "--accent", className: "bg-accent" },
  { name: "sale", token: "--sale", className: "bg-sale" },
];

const badges: ProductBadge[] = [
  "new",
  "bestseller",
  "trending",
  "sale",
  "sold-out",
];

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-12">
      <p className="eyebrow mb-6">{title}</p>
      {children}
    </section>
  );
}

export default function StyleGuidePage() {
  return (
    <>
      <Container className="py-16">
        <header className="mb-6">
        <p className="eyebrow mb-3">Design Foundation</p>
        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          Visual System
        </h1>
        <p className="mt-4 max-w-prose text-muted-foreground">
          An initial, refinable premium/editorial system. Not a homepage — a
          reference for tokens, typography and core primitives.
        </p>
      </header>

      <Block title="Typography">
        <div className="space-y-6">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Serif display (font-serif) — selective
            </p>
            <p className="font-serif text-5xl leading-tight tracking-tight">
              Modern heirlooms
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Serif heading — section title
            </p>
            <p className="font-serif text-3xl tracking-tight">Shop the Look</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">
              Sans interface (font-sans) — body & UI
            </p>
            <p className="max-w-prose">
              Clean modern sans-serif for navigation, product names, prices,
              buttons, labels and forms. The photography and whitespace should
              carry most of the emotional value.
            </p>
          </div>
          <div>
            <p className="eyebrow">Eyebrow / kicker label</p>
          </div>
        </div>
      </Block>

      <Block title="Colour tokens">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {swatches.map((s) => (
            <div key={s.name}>
              <div
                className={`${s.className} h-20 w-full rounded-card border border-border`}
              />
              <p className="mt-2 text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">{s.token}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Buttons">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <ButtonLink href="/" variant="outline" size="md">
              Button link
            </ButtonLink>
          </div>
        </div>
      </Block>

      <Block title="Badges & Filter Pills">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product Badges</p>
            <div className="flex flex-wrap items-center gap-3">
              {badges.map((b) => (
                <Badge key={b} badge={b} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Active Filter Badges</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">Active:</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d6c7b2] bg-[#fbf9f5] px-3 py-1 text-xs font-medium text-[#2d2924] shadow-2xs">
                In Stock <span className="ml-0.5 text-muted-foreground">✕</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d6c7b2] bg-[#fbf9f5] px-3 py-1 text-xs font-medium text-[#2d2924] shadow-2xs">
                Category: Earrings <span className="ml-0.5 text-muted-foreground">✕</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d6c7b2] bg-[#fbf9f5] px-3 py-1 text-xs font-medium text-[#2d2924] shadow-2xs">
                Price: ₹1,000 - ₹5,000 <span className="ml-0.5 text-muted-foreground">✕</span>
              </span>
              <button type="button" className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1">
                Clear all
              </button>
            </div>
          </div>
        </div>
      </Block>

      <Block title="Surfaces & radius">
        <div className="flex flex-wrap gap-6">
          <div className="w-64 rounded-card border border-border bg-surface p-6 shadow-card">
            <p className="font-medium">Card surface</p>
            <p className="mt-1 text-sm text-muted-foreground">
              rounded-card · shadow-card
            </p>
          </div>
          <div className="w-64 rounded-control border border-border bg-surface p-6 shadow-soft">
            <p className="font-medium">Control surface</p>
            <p className="mt-1 text-sm text-muted-foreground">
              rounded-control · shadow-soft
            </p>
          </div>
        </div>
      </Block>

      <Block title="Section heading pattern">
        <SectionHeading
          eyebrow="New In"
          title="New Arrivals"
          cta={{ label: "Shop All", href: "/collections/new-arrivals" }}
        />
      </Block>

        <section className="border-t border-border pt-12">
          <p className="eyebrow">ProductShowcase — grid (desktop) / carousel (mobile)</p>
        </section>
      </Container>

      <ProductShowcase
        eyebrow="New In"
        title="New Arrivals"
        variant="grid"
        collection="new-arrivals"
        cta={{ label: "Shop All", href: "/collections/new-arrivals" }}
      />

      <Container>
        <section className="border-t border-border pt-12">
          <p className="eyebrow">ProductShowcase — carousel</p>
        </section>
      </Container>

      <ProductShowcase
        eyebrow="Proven Favourites"
        title="Bestsellers"
        variant="carousel"
        collection="best-sellers"
        cta={{ label: "Shop All", href: "/collections/best-sellers" }}
      />
    </>
  );
}
