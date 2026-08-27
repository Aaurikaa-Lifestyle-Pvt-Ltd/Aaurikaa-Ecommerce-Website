import type { ComponentType, SVGProps } from "react";
import type { TrustIconKey, TrustItem } from "@/types/commerce";
import { getTrustItems } from "@/lib/data";
import { Container } from "@/components/ui/container";
import {
  IconReturns,
  IconSecure,
  IconShipping,
  IconSupport,
} from "@/components/ui/icons";

interface TrustStripProps {
  /** Pass items directly, or omit to load the configured set. */
  items?: TrustItem[];
}

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const trustIcons: Record<TrustIconKey, IconComponent> = {
  shipping: IconShipping,
  returns: IconReturns,
  support: IconSupport,
  secure: IconSecure,
};

/**
 * TrustStrip (brief §24) — light service benefits that reduce purchase hesitation.
 *
 * Compact, understated, icon + title + short copy. Not an image-heavy campaign
 * and not heavy-bordered cards. Industry-neutral: understands `TrustItem`.
 */
export async function TrustStrip({ items }: TrustStripProps) {
  const benefits = items ?? (await getTrustItems());
  if (!benefits.length) return null;

  return (
    <section className="border-y border-border/80 bg-[#f4eee4] py-10 sm:py-12">
      <Container>
        <h2 className="sr-only">Shopping with confidence</h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 md:gap-8">
          {benefits.map((item) => {
            const Icon = trustIcons[item.icon];
            return (
              <li key={item.id} className="flex flex-col gap-2.5">
                <Icon className="h-5 w-5 text-foreground" />
                <h3 className="text-sm font-medium tracking-wide text-foreground">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
