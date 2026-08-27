import type { Product } from "@/types/commerce";
import { cn } from "@/lib/cn";
import { StructuredContent } from "@/components/product/structured-content";
import { hasMeaningfulRichText } from "@/lib/rich-text/rich-text-utils";

interface ProductDetailsProps {
  product: Product;
  className?: string;
}

type DetailSectionView = {
  id: string;
  title: string;
  content?: string;
  richContents?: string[];
};

function sectionHasBody(section: DetailSectionView): boolean {
  const hasPlain = Boolean(section.content?.trim());
  const hasRich = Boolean(
    section.richContents?.some((entry) => hasMeaningfulRichText(entry)),
  );
  return hasPlain || hasRich;
}

/**
 * Clean expandable details for description, materials, care, shipping.
 * Uses native <details> — no accordion library.
 * API-mapped products put description inside details ("Product Details").
 * Mock/demo products may only set `product.description` — keep that accordion.
 */
export function ProductDetails({ product, className }: ProductDetailsProps) {
  const mappedDetails = product.details ?? [];
  const hasMappedProductDetails = mappedDetails.some(
    (section) =>
      section.id === "product-details" || section.title === "Product Details",
  );

  const sections: DetailSectionView[] = [];

  if (
    product.description &&
    !hasMappedProductDetails &&
    hasMeaningfulRichText(product.description)
  ) {
    sections.push({
      id: "description",
      title: "Product Details",
      richContents: [product.description],
    });
  }

  for (const section of mappedDetails) {
    const view: DetailSectionView = {
      id: section.id,
      title: section.title,
      content: section.content,
      richContents: section.richContents,
    };
    if (sectionHasBody(view)) sections.push(view);
  }

  for (const [index, faq] of (product.faqs ?? []).entries()) {
    const view: DetailSectionView = {
      id: `faq-${index}`,
      title: faq.question,
      content: faq.answer,
    };
    if (sectionHasBody(view)) sections.push(view);
  }

  if (sections.length === 0) return null;

  return (
    <div className={cn("border-t border-border", className)}>
      {sections.map((section, index) => (
        <details
          key={section.id}
          className="group border-b border-border"
          open={index === 0}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-sm font-medium outline-none marker:content-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>{section.title}</span>
            <span
              aria-hidden
              className="text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div className="space-y-3 pb-5 text-sm leading-relaxed text-muted-foreground">
            {section.content?.trim() ? (
              <div className="whitespace-pre-line">{section.content}</div>
            ) : null}
            {section.id === "manufacturer" && product.seller?.isVerified ? (
              <div className="pt-1">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
                  <svg className="h-3.5 w-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Verified Seller
                </span>
              </div>
            ) : null}
            {section.richContents?.map((rich, i) => (
              <StructuredContent key={`${section.id}-rich-${i}`} content={rich} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
