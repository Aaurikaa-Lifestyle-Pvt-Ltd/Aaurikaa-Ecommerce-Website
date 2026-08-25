import type { ReactNode } from "react";
import { sanitizeContentHref } from "./sanitize-href";
import { parseTipTapDoc } from "./tiptap-parse";
import type { TipTapMark, TipTapNode } from "./tiptap-types";

export type { TipTapMark, TipTapNode } from "./tiptap-types";
export { parseTipTapDoc } from "./tiptap-parse";

function renderMarks(text: string, marks: TipTapMark[] | undefined, key: string): ReactNode {
  let node: ReactNode = text;
  if (!marks?.length) return <span key={key}>{node}</span>;

  for (const mark of marks) {
    const type = mark.type;
    if (type === "bold" || type === "strong") {
      node = <strong key={`${key}-b`}>{node}</strong>;
    } else if (type === "italic" || type === "em") {
      node = <em key={`${key}-i`}>{node}</em>;
    } else if (type === "link") {
      const href = sanitizeContentHref(mark.attrs?.href);
      if (href) {
        const external = href.startsWith("http");
        node = (
          <a
            key={`${key}-a`}
            href={href}
            className="underline underline-offset-4 hover:text-foreground"
            {...(external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {node}
          </a>
        );
      }
    }
  }
  return <span key={key}>{node}</span>;
}

function renderInline(nodes: TipTapNode[] | undefined, keyPrefix: string): ReactNode[] {
  if (!nodes?.length) return [];
  return nodes.map((child, index) => {
    const key = `${keyPrefix}-${index}`;
    if (child.type === "text" && typeof child.text === "string") {
      return renderMarks(child.text, child.marks, key);
    }
    if (child.type === "hardBreak") {
      return <br key={key} />;
    }
    return null;
  });
}

function renderBlock(node: TipTapNode, key: string): ReactNode {
  const type = node.type;
  if (type === "paragraph") {
    const children = renderInline(node.content, key);
    if (!children.length) return <p key={key} className="min-h-[1em]" />;
    return (
      <p key={key} className="text-base leading-relaxed text-muted-foreground">
        {children}
      </p>
    );
  }
  if (type === "heading") {
    const level = Number(node.attrs?.level) || 2;
    const children = renderInline(node.content, key);
    const className = "font-serif text-xl tracking-tight text-foreground sm:text-2xl";
    if (level <= 2) return <h2 key={key} className={className}>{children}</h2>;
    if (level === 3) return <h3 key={key} className={className}>{children}</h3>;
    return <h4 key={key} className={className}>{children}</h4>;
  }
  if (type === "bulletList") {
    return (
      <ul key={key} className="list-disc space-y-2 pl-5 text-muted-foreground">
        {(node.content ?? []).map((item, i) => renderBlock(item, `${key}-li-${i}`))}
      </ul>
    );
  }
  if (type === "orderedList") {
    return (
      <ol key={key} className="list-decimal space-y-2 pl-5 text-muted-foreground">
        {(node.content ?? []).map((item, i) => renderBlock(item, `${key}-li-${i}`))}
      </ol>
    );
  }
  if (type === "listItem") {
    return (
      <li key={key} className="leading-relaxed">
        {(node.content ?? []).map((child, i) => {
          if (child.type === "paragraph") {
            return (
              <span key={`${key}-p-${i}`} className="block">
                {renderInline(child.content, `${key}-p-${i}`)}
              </span>
            );
          }
          return renderBlock(child, `${key}-c-${i}`);
        })}
      </li>
    );
  }
  if (type === "blockquote") {
    return (
      <blockquote
        key={key}
        className="border-l border-border pl-4 italic text-muted-foreground"
      >
        {(node.content ?? []).map((child, i) => renderBlock(child, `${key}-q-${i}`))}
      </blockquote>
    );
  }
  return null;
}

/** Minimal TipTap JSON → React. Safe subset only; unknown nodes skipped. */
export function TipTapRenderer({ content }: { content: unknown }) {
  const doc = parseTipTapDoc(content);
  if (!doc?.content?.length) return null;
  return (
    <div className="space-y-4">
      {doc.content.map((node, index) => renderBlock(node, `n-${index}`))}
    </div>
  );
}
