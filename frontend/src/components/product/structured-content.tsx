import React from "react";
import Link from "next/link";
import {
  escapeAttr,
  hasMeaningfulRichText,
  isLegacyStructuredDoc,
  isTiptapDoc,
  normalizeToTiptapDoc,
  sanitizeHref,
  sanitizeImageSrc,
  type TiptapJSONNode,
} from "@/lib/rich-text/rich-text-utils";

const SAFE_HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function safeStyleColor(hex: unknown): string | undefined {
  if (!hex || typeof hex !== "string") return undefined;
  return SAFE_HEX.test(hex.trim()) ? hex.trim() : undefined;
}

const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;

function alignStyleFromNode(node: TiptapJSONNode): React.CSSProperties | undefined {
  const align = node?.attrs?.textAlign;
  if (typeof align !== "string" || !TEXT_ALIGNS.includes(align as (typeof TEXT_ALIGNS)[number])) {
    return undefined;
  }
  return { textAlign: align as (typeof TEXT_ALIGNS)[number] };
}

function renderInline(nodes: TiptapJSONNode[] = [], keyPrefix = "inl"): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (!node) return null;

    if (node.type === "hardBreak") return <br key={key} />;

    if (node.type === "text") {
      const text = node.text || "";
      const marks = Array.isArray(node.marks) ? node.marks : [];

      let el: React.ReactNode = <React.Fragment key={key}>{text}</React.Fragment>;

      marks.forEach((mark, mIdx) => {
        const mKey = `${key}-m-${mIdx}`;
        if (mark.type === "bold") el = <strong key={mKey}>{el}</strong>;
        else if (mark.type === "italic") el = <em key={mKey}>{el}</em>;
        else if (mark.type === "underline") el = <u key={mKey}>{el}</u>;
        else if (mark.type === "strike") el = <s key={mKey}>{el}</s>;
        else if (mark.type === "code") {
          el = (
            <code key={mKey} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
              {el}
            </code>
          );
        } else if (mark.type === "textStyle" && mark.attrs?.color) {
          const c = safeStyleColor(mark.attrs.color);
          if (c) el = <span key={mKey} style={{ color: c }}>{el}</span>;
        } else if (mark.type === "color" && mark.attrs?.color) {
          const c = safeStyleColor(mark.attrs.color);
          if (c) el = <span key={mKey} style={{ color: c }}>{el}</span>;
        } else if (mark.type === "highlight" && mark.attrs?.color) {
          const c = safeStyleColor(mark.attrs.color);
          if (c) el = <mark key={mKey} style={{ backgroundColor: c }}>{el}</mark>;
          else el = <mark key={mKey} className="bg-muted">{el}</mark>;
        } else if (mark.type === "fontSize" && mark.attrs?.fontSize) {
          const px = Number(mark.attrs.fontSize);
          if ([14, 16, 20, 24].includes(px)) {
            el = <span key={mKey} style={{ fontSize: `${px}px` }}>{el}</span>;
          }
        } else if (mark.type === "link") {
          const href = sanitizeHref(String(mark.attrs?.href || ""));
          if (!href) return;
          const variant = mark.attrs?.variant || "default";
          const className =
            variant === "hidden"
              ? "no-underline text-inherit"
              : "underline underline-offset-2 hover:text-foreground";
          const isInternal = href.startsWith("/");
          el = isInternal ? (
            <Link key={mKey} href={href} className={className}>
              {el}
            </Link>
          ) : (
            <a
              key={mKey}
              href={href}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className={className}
            >
              {el}
            </a>
          );
        }
      });

      return el;
    }

    return null;
  });
}

function Block({
  node,
  idx,
  inMediaText,
}: {
  node: TiptapJSONNode | null | undefined;
  idx: string | number;
  inMediaText?: boolean;
}) {
  if (!node) return null;
  const key = `blk-${idx}`;

  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      const cls =
        level <= 2
          ? "mb-3 font-serif text-xl tracking-tight text-foreground sm:text-2xl"
          : level === 3
            ? "mb-2 font-serif text-lg tracking-tight text-foreground sm:text-xl"
            : "mb-2 text-base font-semibold text-foreground";
      return (
        <Tag key={key} className={cls} style={alignStyleFromNode(node)}>
          {renderInline(node.content, key)}
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p
          key={key}
          className="mb-3 text-sm leading-relaxed text-muted-foreground last:mb-0 sm:text-base"
          style={alignStyleFromNode(node)}
        >
          {renderInline(node.content, key)}
        </p>
      );

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="mb-3 border-l border-border pl-4 italic text-muted-foreground"
          style={alignStyleFromNode(node)}
        >
          {renderInline(node.content, key)}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre
          key={key}
          className="mb-3 overflow-x-auto rounded-[var(--radius-sm)] bg-muted p-3 text-sm text-foreground"
        >
          <code>{renderInline(node.content, key)}</code>
        </pre>
      );

    case "bulletList":
      return (
        <ul key={key} className="mb-3 list-disc space-y-1 pl-5 text-muted-foreground">
          {(node.content || []).map((child, i) => (
            <Block key={`${key}-li-${i}`} node={child} idx={`${idx}-li-${i}`} />
          ))}
        </ul>
      );

    case "orderedList":
      return (
        <ol key={key} className="mb-3 list-decimal space-y-1 pl-5 text-muted-foreground">
          {(node.content || []).map((child, i) => (
            <Block key={`${key}-li-${i}`} node={child} idx={`${idx}-li-${i}`} />
          ))}
        </ol>
      );

    case "listItem":
      return (
        <li key={key} className="leading-relaxed">
          {(node.content || []).map((child, i) => (
            <Block key={`${key}-it-${i}`} node={child} idx={`${idx}-it-${i}`} />
          ))}
        </li>
      );

    case "image": {
      const src = sanitizeImageSrc(String(node.attrs?.src || ""));
      const alt = escapeAttr(String(node.attrs?.alt || ""));
      const title = escapeAttr(String(node.attrs?.title || ""));
      if (!src) return null;
      if (inMediaText) {
        return (
          <figure key={key} className="my-0 w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="h-auto w-full rounded-[var(--radius-md)]" />
            {title ? (
              <figcaption className="mt-2 text-sm italic text-muted-foreground">{title}</figcaption>
            ) : null}
          </figure>
        );
      }
      const align = String(node.attrs?.align || "center");
      const size = Math.max(10, Math.min(100, Number(node.attrs?.size || 100)));
      const widthAttr = node.attrs?.width;
      const width = ["25%", "50%", "75%", "100%"].includes(String(widthAttr))
        ? String(widthAttr)
        : "100%";
      const alignClass =
        align === "left" ? "mr-auto" : align === "right" ? "ml-auto" : "mx-auto";
      return (
        <figure key={key} className={`${alignClass} my-4`} style={{ width: `${size}%`, maxWidth: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="h-auto w-full rounded-[var(--radius-md)]" style={{ width }} />
          {title ? (
            <figcaption className="mt-2 text-center text-sm italic text-muted-foreground">
              {title}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case "table":
      return (
        <div key={key} className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-border">
          <table className="w-full border-collapse text-left text-sm">
            <tbody>
              {(node.content || []).map((row, rIdx) => (
                <tr key={`${key}-row-${rIdx}`} className={rIdx % 2 === 0 ? "bg-surface" : "bg-muted/40"}>
                  {(row.content || []).map((cell, cIdx) => {
                    const isHeader = cell.type === "tableHeader";
                    const CellTag = isHeader ? "th" : "td";
                    return (
                      <CellTag
                        key={`${key}-cell-${rIdx}-${cIdx}`}
                        className={`border-b border-border px-3 py-2 ${
                          isHeader
                            ? "bg-muted text-xs font-semibold uppercase tracking-wide text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {(cell.content || []).map((contentNode, ci) => (
                          <Block
                            key={`${key}-cell-content-${ci}`}
                            node={contentNode}
                            idx={`${idx}-cell-content-${ci}`}
                          />
                        ))}
                      </CellTag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "cta": {
      const text = String(node.attrs?.text || "Click here");
      const href = sanitizeHref(String(node.attrs?.href || ""));
      if (!href) return null;
      const variant = String(node.attrs?.variant || "primary");
      const className =
        variant === "secondary"
          ? "inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          : "inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90";
      const isInternal = href.startsWith("/");
      return (
        <div key={key} className="my-4">
          {isInternal ? (
            <Link href={href} className={className}>
              {text}
            </Link>
          ) : (
            <a href={href} target="_blank" rel="nofollow noopener noreferrer" className={className}>
              {text}
            </a>
          )}
        </div>
      );
    }

    case "ctaButton": {
      const text = String(node.attrs?.text || "Click here");
      const url = sanitizeHref(String(node.attrs?.url || ""));
      if (!url) return null;
      const variant = String(node.attrs?.variant || "primary");
      const className =
        variant === "secondary"
          ? "inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted"
          : "inline-flex items-center justify-center rounded-[var(--radius-sm)] bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90";
      const isInternal = url.startsWith("/");
      return (
        <div key={key} className="my-4">
          {isInternal ? (
            <Link href={url} className={className}>
              {text}
            </Link>
          ) : (
            <a href={url} target="_blank" rel="nofollow noopener noreferrer" className={className}>
              {text}
            </a>
          )}
        </div>
      );
    }

    case "mediaGroup": {
      const children = (node.content || []).map((child, i) => (
        <div
          key={`${key}-mg-${i}`}
          className="media-group-item min-w-0 max-w-full basis-1/2 shrink max-md:basis-full"
        >
          <Block node={child} idx={`${idx}-mg-${i}`} />
        </div>
      ));
      return (
        <div
          key={key}
          className="my-4 flex flex-nowrap gap-4 max-md:flex-col"
          data-media-group="true"
        >
          {children}
        </div>
      );
    }

    case "mediaText": {
      const layout = String(node.attrs?.layout || "imageLeft");
      const content = node.content || [];
      const imageNode = content.find((c) => c.type === "image");
      const paragraphNode = content.find((c) => c.type === "paragraph");
      const isLeft = layout === "imageLeft";
      const imageWidth = imageNode?.attrs?.width;
      const imageSize = Math.max(10, Math.min(100, Number(imageNode?.attrs?.size ?? 50)));
      const basisPercent = ["25%", "50%", "75%", "100%"].includes(String(imageWidth))
        ? String(imageWidth)
        : `${imageSize}%`;
      const maxWidthClass =
        basisPercent === "100%"
          ? "md:max-w-full"
          : basisPercent === "75%"
            ? "md:max-w-[75%]"
            : basisPercent === "50%"
              ? "md:max-w-[50%]"
              : basisPercent === "25%"
                ? "md:max-w-[25%]"
                : "md:max-w-[50%]";
      return (
        <div
          key={key}
          className="my-4 flex flex-nowrap items-start gap-4 max-md:flex-col"
          data-media-text="true"
          data-layout={layout}
        >
          {imageNode ? (
            <div
              className={`media-text-image-col min-w-0 max-w-full flex-shrink-0 max-md:w-full ${maxWidthClass} ${isLeft ? "order-first" : "order-last"}`}
              style={{ flexBasis: basisPercent }}
            >
              <Block node={imageNode} idx={`${idx}-mt-img`} inMediaText />
            </div>
          ) : null}
          {paragraphNode ? (
            <div className="min-w-0 flex-1">
              <Block node={paragraphNode} idx={`${idx}-mt-p`} />
            </div>
          ) : null}
        </div>
      );
    }

    default:
      return null;
  }
}

function coerceContentForRender(content: unknown): unknown {
  if (content == null) return null;
  if (typeof content === "string") return content;
  if (typeof content === "object" && isTiptapDoc(content)) return content;
  if (typeof content === "object" && isLegacyStructuredDoc(content)) return content;
  return "";
}

/**
 * Renders TipTap JSON, legacy structured blocks, or plain text for PDP narratives.
 * Uses normalizeToTiptapDoc so empty TipTap docs and plain legacy remain readable.
 */
export function StructuredContent({
  content,
  className,
}: {
  content: unknown;
  className?: string;
}) {
  if (!hasMeaningfulRichText(content)) return null;
  const normalized = coerceContentForRender(content);
  if (normalized == null) return null;
  const doc = normalizeToTiptapDoc(normalized);
  return (
    <div className={className ?? "structured-content w-full space-y-1"}>
      {(doc.content || []).map((node, idx) => (
        <Block key={`node-${idx}`} node={node} idx={idx} />
      ))}
    </div>
  );
}

export default StructuredContent;
