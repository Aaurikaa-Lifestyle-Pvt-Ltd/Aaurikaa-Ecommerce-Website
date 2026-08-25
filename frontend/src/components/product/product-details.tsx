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
            {section.richContents?.map((rich, i) => (
              <StructuredContent key={`${section.id}-rich-${i}`} content={rich} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
