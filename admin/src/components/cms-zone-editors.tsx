"use client";

import { useId, useState } from "react";
import { CmsMediaField, type CmsMediaRef } from "@/components/cms-media-field";
import { ProductStructuredEditor } from "@/components/product-structured-editor";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import {
  type CardGridItem,
  type FaqItem,
  type OrderedSection,
} from "@/lib/cms-ordered-sections";
import {
  editableTextToTiptapJson,
  richTextValueToEditorString,
} from "@/lib/tiptap-plain";

export type { CardGridItem, FaqItem, OrderedSection } from "@/lib/cms-ordered-sections";
export { pruneOrderedSections } from "@/lib/cms-ordered-sections";

const EMPTY_TIPTAP = editableTextToTiptapJson("");

export type HeroBannerValue = {
  media?: CmsMediaRef;
  title?: string;
  subcopy?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export type ImageBlockValue = { media?: CmsMediaRef };

export type ImageTextValue = {
  media?: CmsMediaRef;
  bodyRichText?: string;
  imagePosition?: "left" | "right";
};

export type CtaValue = {
  heading?: string;
  description?: string;
  buttonLabel?: string;
  buttonHref?: string;
};

function asObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : fallback;
}

function emptyMedia(withCaption = false): CmsMediaRef {
  return withCaption
    ? { mediaId: "", url: "", alt: "", caption: "" }
    : { mediaId: "", url: "", alt: "" };
}

const SECTION_TYPE_LABELS: Record<string, string> = {
  richText: "Text section",
  image: "Image",
  imageText: "Image + text",
  cardGrid: "Card grid",
  faqList: "FAQ list",
  ctaCard: "Call to action",
  cta: "Call to action",
  contactCard: "Contact card",
  supportPanel: "Support panel",
  heroBanner: "Hero banner",
};

function sectionLabel(type: string): string {
  return SECTION_TYPE_LABELS[type] || type;
}

export function HeroBannerEditor({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description?: string;
  value: unknown;
  onChange: (value: HeroBannerValue) => void;
}) {
  const hero = asObject<HeroBannerValue>(value, {
    media: emptyMedia(),
    title: "",
    subcopy: "",
    ctaLabel: "",
    ctaHref: "",
  });
  const media = hero.media ?? emptyMedia();

  return (
    <Card>
      <CardHeader title={title} description={description || "Hero image with optional title, subcopy, and CTA."} />
      <div className="grid gap-4 p-4 sm:p-5">
        <CmsMediaField
          label="Hero image"
          value={media}
          onChange={(next) => onChange({ ...hero, media: next })}
        />
        <Field label="Title">
          <Input
            value={hero.title ?? ""}
            onChange={(e) => onChange({ ...hero, title: e.target.value })}
          />
        </Field>
        <Field label="Subcopy">
          <Textarea
            rows={3}
            value={hero.subcopy ?? ""}
            onChange={(e) => onChange({ ...hero, subcopy: e.target.value })}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CTA label">
            <Input
              value={hero.ctaLabel ?? ""}
              onChange={(e) => onChange({ ...hero, ctaLabel: e.target.value })}
            />
          </Field>
          <Field label="CTA link">
            <Input
              value={hero.ctaHref ?? ""}
              onChange={(e) => onChange({ ...hero, ctaHref: e.target.value })}
              placeholder="/contact or https://…"
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

export function ImageBlockEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: unknown;
  onChange: (value: ImageBlockValue) => void;
}) {
  const block = asObject<ImageBlockValue>(value, { media: emptyMedia(true) });
  const media = block.media ?? emptyMedia(true);

  return (
    <Card>
      <CardHeader title={title} description="Single image block with optional caption." />
      <div className="p-4 sm:p-5">
        <CmsMediaField
          allowCaption
          value={media}
          onChange={(next) => onChange({ media: next })}
        />
      </div>
    </Card>
  );
}

export function ImageTextEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: unknown;
  onChange: (value: ImageTextValue) => void;
}) {
  const block = asObject<ImageTextValue>(value, {
    media: emptyMedia(true),
    bodyRichText: EMPTY_TIPTAP,
    imagePosition: "left",
  });
  const media = block.media ?? emptyMedia(true);

  return (
    <Card>
      <CardHeader title={title} description="Image beside body copy." />
      <div className="grid gap-4 p-4 sm:p-5">
        <CmsMediaField
          allowCaption
          value={media}
          onChange={(next) => onChange({ ...block, media: next })}
        />
        <Field label="Image position">
          <Select
            value={block.imagePosition === "right" ? "right" : "left"}
            onChange={(e) =>
              onChange({
                ...block,
                imagePosition: e.target.value === "right" ? "right" : "left",
              })
            }
          >
            <option value="left">Image left</option>
            <option value="right">Image right</option>
          </Select>
        </Field>
        <Field label="Body">
          <ProductStructuredEditor
            value={richTextValueToEditorString(block.bodyRichText)}
            onChange={(bodyRichText) => onChange({ ...block, bodyRichText })}
            context="CMS"
            placeholder="Write body copy…"
            minHeight={180}
          />
        </Field>
      </div>
    </Card>
  );
}

export function CtaEditor({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description?: string;
  value: unknown;
  onChange: (value: CtaValue) => void;
}) {
  const card = asObject<CtaValue>(value, {
    heading: "",
    description: "",
    buttonLabel: "",
    buttonHref: "",
  });

  return (
    <Card>
      <CardHeader
        title={title}
        description={description || "Call-to-action block (heading required to publish)."}
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        <Field label="Heading" className="sm:col-span-2">
          <Input
            value={card.heading ?? ""}
            onChange={(e) => onChange({ ...card, heading: e.target.value })}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea
            rows={3}
            value={card.description ?? ""}
            onChange={(e) => onChange({ ...card, description: e.target.value })}
          />
        </Field>
        <Field label="Button label">
          <Input
            value={card.buttonLabel ?? ""}
            onChange={(e) => onChange({ ...card, buttonLabel: e.target.value })}
          />
        </Field>
        <Field label="Button link">
          <Input
            value={card.buttonHref ?? ""}
            onChange={(e) => onChange({ ...card, buttonHref: e.target.value })}
            placeholder="/contact or https://…"
          />
        </Field>
      </div>
    </Card>
  );
}

export function CardGridEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: unknown;
  onChange: (value: CardGridItem[]) => void;
}) {
  const items = Array.isArray(value) ? (value as CardGridItem[]) : [];

  return (
    <Card>
      <CardHeader title={title} description="Grid of cards with optional image and link." />
      <div className="space-y-3 p-4 sm:p-5">
        {items.map((item, index) => (
          <div key={index} className="grid gap-3 rounded-[var(--radius-md)] border border-border p-3">
            <Field label="Title">
              <Input
                value={item.title ?? ""}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], title: e.target.value };
                  onChange(next);
                }}
              />
            </Field>
            <Field label="Description">
              <Textarea
                rows={2}
                value={item.description ?? ""}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], description: e.target.value };
                  onChange(next);
                }}
              />
            </Field>
            <Field label="Link (optional)">
              <Input
                value={item.href ?? ""}
                onChange={(e) => {
                  const next = [...items];
                  next[index] = { ...next[index], href: e.target.value };
                  onChange(next);
                }}
                placeholder="/collections or https://…"
              />
            </Field>
            <CmsMediaField
              label="Card image (optional)"
              value={item.media ?? emptyMedia()}
              onChange={(media) => {
                const next = [...items];
                next[index] = { ...next[index], media };
                onChange(next);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              Remove card
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            onChange([
              ...items,
              { title: "", description: "", href: "", media: emptyMedia() },
            ])
          }
        >
          Add card
        </Button>
      </div>
    </Card>
  );
}

function createEmptySection(type: string): OrderedSection {
  switch (type) {
    case "richText":
      return { type: "richText", heading: "", bodyRichText: EMPTY_TIPTAP };
    case "image":
      return { type: "image", media: emptyMedia(true) };
    case "imageText":
      return {
        type: "imageText",
        media: emptyMedia(true),
        bodyRichText: EMPTY_TIPTAP,
        imagePosition: "left",
      };
    case "cardGrid":
      return { type: "cardGrid", items: [] };
    case "faqList":
      return { type: "faqList", items: [] };
    case "cta":
    case "ctaCard":
      return {
        type: "ctaCard",
        heading: "",
        description: "",
        buttonLabel: "",
        buttonHref: "",
      };
    case "contactCard":
      return {
        type: "contactCard",
        heading: "",
        intro: "",
        organizationName: "",
        phone: "",
        email: "",
        addressLines: [],
        buttonLabel: "",
        buttonHref: "",
      };
    case "supportPanel":
      return {
        type: "supportPanel",
        heading: "",
        description: "",
        actions: [{ label: "", href: "" }],
      };
    case "heroBanner":
      return {
        type: "heroBanner",
        media: emptyMedia(),
        title: "",
        subcopy: "",
        ctaLabel: "",
        ctaHref: "",
      };
    default:
      return { type };
  }
}

function OrderedSectionItemEditor({
  section,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  section: OrderedSection;
  onChange: (section: OrderedSection) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const type = section.type === "cta" ? "ctaCard" : section.type;

  return (
    <div className="rounded-[var(--radius-md)] border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-sm font-medium">{sectionLabel(type)}</p>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" disabled={!canMoveUp} onClick={onMoveUp}>
            Up
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            Down
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      <div className="p-3">
        {type === "richText" ? (
          <div className="grid gap-3">
            <Field label="Heading (optional)">
              <Input
                value={section.heading ?? ""}
                onChange={(e) => onChange({ ...section, heading: e.target.value })}
              />
            </Field>
            <Field label="Body">
              <ProductStructuredEditor
                value={richTextValueToEditorString(section.bodyRichText)}
                onChange={(bodyRichText) =>
                  onChange({
                    ...section,
                    bodyRichText,
                  })
                }
                context="CMS"
                placeholder="Write section body…"
                minHeight={160}
              />
            </Field>
          </div>
        ) : null}

        {type === "image" ? (
          <CmsMediaField
            allowCaption
            value={section.media ?? emptyMedia(true)}
            onChange={(media) => onChange({ ...section, media })}
          />
        ) : null}

        {type === "imageText" ? (
          <div className="grid gap-3">
            <CmsMediaField
              allowCaption
              value={section.media ?? emptyMedia(true)}
              onChange={(media) => onChange({ ...section, media })}
            />
            <Field label="Image position">
              <Select
                value={section.imagePosition === "right" ? "right" : "left"}
                onChange={(e) =>
                  onChange({
                    ...section,
                    imagePosition: e.target.value === "right" ? "right" : "left",
                  })
                }
              >
                <option value="left">Image left</option>
                <option value="right">Image right</option>
              </Select>
            </Field>
            <Field label="Body">
              <ProductStructuredEditor
                value={richTextValueToEditorString(section.bodyRichText)}
                onChange={(bodyRichText) =>
                  onChange({
                    ...section,
                    bodyRichText,
                  })
                }
                context="CMS"
                placeholder="Write body copy…"
                minHeight={160}
              />
            </Field>
          </div>
        ) : null}

        {type === "faqList" ? (
          <FaqListFields
            items={Array.isArray(section.items) ? (section.items as FaqItem[]) : []}
            onChange={(items) => onChange({ ...section, items })}
          />
        ) : null}

        {type === "cardGrid" ? (
          <CardGridInline
            items={Array.isArray(section.items) ? (section.items as CardGridItem[]) : []}
            onChange={(items) => onChange({ ...section, items })}
          />
        ) : null}

        {type === "ctaCard" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Heading" className="sm:col-span-2">
              <Input
                value={section.heading ?? ""}
                onChange={(e) => onChange({ ...section, heading: e.target.value })}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={section.description ?? ""}
                onChange={(e) => onChange({ ...section, description: e.target.value })}
              />
            </Field>
            <Field label="Button label">
              <Input
                value={section.buttonLabel ?? ""}
                onChange={(e) => onChange({ ...section, buttonLabel: e.target.value })}
              />
            </Field>
            <Field label="Button link">
              <Input
                value={section.buttonHref ?? ""}
                onChange={(e) => onChange({ ...section, buttonHref: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {type === "contactCard" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Heading" className="sm:col-span-2">
              <Input
                value={section.heading ?? ""}
                onChange={(e) => onChange({ ...section, heading: e.target.value })}
              />
            </Field>
            <Field label="Intro" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={section.intro ?? ""}
                onChange={(e) => onChange({ ...section, intro: e.target.value })}
              />
            </Field>
            <Field label="Organization">
              <Input
                value={section.organizationName ?? ""}
                onChange={(e) => onChange({ ...section, organizationName: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={section.phone ?? ""}
                onChange={(e) => onChange({ ...section, phone: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={section.email ?? ""}
                onChange={(e) => onChange({ ...section, email: e.target.value })}
              />
            </Field>
            <Field label="Button label">
              <Input
                value={section.buttonLabel ?? ""}
                onChange={(e) => onChange({ ...section, buttonLabel: e.target.value })}
              />
            </Field>
            <Field label="Address lines" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={(section.addressLines ?? []).join("\n")}
                onChange={(e) =>
                  onChange({
                    ...section,
                    addressLines: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
            <Field label="Button link" className="sm:col-span-2">
              <Input
                value={section.buttonHref ?? ""}
                onChange={(e) => onChange({ ...section, buttonHref: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {type === "supportPanel" ? (
          <SupportPanelInline
            heading={section.heading ?? ""}
            description={section.description ?? ""}
            actions={section.actions ?? [{ label: "", href: "" }]}
            onChange={(next) => onChange({ ...section, ...next })}
          />
        ) : null}

        {type === "heroBanner" ? (
          <div className="grid gap-3">
            <CmsMediaField
              value={section.media ?? emptyMedia()}
              onChange={(media) => onChange({ ...section, media })}
            />
            <Field label="Title">
              <Input
                value={section.title ?? ""}
                onChange={(e) => onChange({ ...section, title: e.target.value })}
              />
            </Field>
            <Field label="Subcopy">
              <Textarea
                rows={2}
                value={section.subcopy ?? ""}
                onChange={(e) => onChange({ ...section, subcopy: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CTA label">
                <Input
                  value={section.ctaLabel ?? ""}
                  onChange={(e) => onChange({ ...section, ctaLabel: e.target.value })}
                />
              </Field>
              <Field label="CTA link">
                <Input
                  value={section.ctaHref ?? ""}
                  onChange={(e) => onChange({ ...section, ctaHref: e.target.value })}
                />
              </Field>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FaqListFields({
  items,
  onChange,
}: {
  items: FaqItem[];
  onChange: (items: FaqItem[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-[var(--radius-sm)] border border-border p-3">
          <Input
            placeholder="Category"
            value={item.category ?? ""}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], category: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="Question"
            value={item.q ?? ""}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], q: e.target.value };
              onChange(next);
            }}
          />
          <Textarea
            placeholder="Answer"
            value={item.a ?? ""}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], a: e.target.value };
              onChange(next);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange([...items, { category: "", q: "", a: "" }])}
      >
        Add FAQ item
      </Button>
    </div>
  );
}

function CardGridInline({
  items,
  onChange,
}: {
  items: CardGridItem[];
  onChange: (items: CardGridItem[]) => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="grid gap-2 rounded-[var(--radius-sm)] border border-border p-3">
          <Input
            placeholder="Title"
            value={item.title ?? ""}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], title: e.target.value };
              onChange(next);
            }}
          />
          <Textarea
            placeholder="Description"
            rows={2}
            value={item.description ?? ""}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], description: e.target.value };
              onChange(next);
            }}
          />
          <Input
            placeholder="Link"
            value={item.href ?? ""}
            onChange={(e) => {
              const next = [...items];
              next[index] = { ...next[index], href: e.target.value };
              onChange(next);
            }}
          />
          <CmsMediaField
            label="Image (optional)"
            value={item.media ?? emptyMedia()}
            onChange={(media) => {
              const next = [...items];
              next[index] = { ...next[index], media };
              onChange(next);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove card
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          onChange([...items, { title: "", description: "", href: "", media: emptyMedia() }])
        }
      >
        Add card
      </Button>
    </div>
  );
}

function SupportPanelInline({
  heading,
  description,
  actions,
  onChange,
}: {
  heading: string;
  description: string;
  actions: Array<{ label?: string; href?: string }>;
  onChange: (next: {
    heading: string;
    description: string;
    actions: Array<{ label?: string; href?: string }>;
  }) => void;
}) {
  return (
    <div className="space-y-3">
      <Field label="Heading">
        <Input
          value={heading}
          onChange={(e) => onChange({ heading: e.target.value, description, actions })}
        />
      </Field>
      <Field label="Description">
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => onChange({ heading, description: e.target.value, actions })}
        />
      </Field>
      {actions.map((action, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Action label"
            value={action.label ?? ""}
            onChange={(e) => {
              const next = [...actions];
              next[index] = { ...next[index], label: e.target.value };
              onChange({ heading, description, actions: next });
            }}
          />
          <Input
            placeholder="Action link"
            value={action.href ?? ""}
            onChange={(e) => {
              const next = [...actions];
              next[index] = { ...next[index], href: e.target.value };
              onChange({ heading, description, actions: next });
            }}
          />
        </div>
      ))}
      {actions.length < 4 ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange({
              heading,
              description,
              actions: [...actions, { label: "", href: "" }],
            })
          }
        >
          Add action
        </Button>
      ) : null}
    </div>
  );
}

export function OrderedSectionsEditor({
  title,
  description,
  allowedTypes,
  value,
  onChange,
}: {
  title: string;
  description?: string;
  allowedTypes: string[];
  value: unknown;
  onChange: (value: OrderedSection[]) => void;
}) {
  const selectId = useId();
  const sections = Array.isArray(value) ? (value as OrderedSection[]) : [];
  const [addType, setAddType] = useState(allowedTypes[0] ?? "richText");
  const types = allowedTypes.length
    ? allowedTypes
    : ["richText", "image", "imageText", "cardGrid", "faqList", "ctaCard"];

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  }

  return (
    <Card>
      <CardHeader
        title={title}
        description={
          description ||
          "Add and reorder allowlisted sections. Incomplete stubs are dropped on save. Max 24."
        }
      />
      <div className="space-y-3 p-4 sm:p-5">
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sections yet. Add one below.</p>
        ) : (
          sections.map((section, index) => (
            <OrderedSectionItemEditor
              key={section.id || `${section.type}-${index}`}
              section={section}
              onChange={(next) => {
                const copy = [...sections];
                copy[index] = next;
                onChange(copy);
              }}
              onRemove={() => onChange(sections.filter((_, i) => i !== index))}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              canMoveUp={index > 0}
              canMoveDown={index < sections.length - 1}
            />
          ))
        )}

        {sections.length < 24 ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <Field label="Section type" htmlFor={selectId} className="min-w-[12rem] flex-1">
              <Select
                id={selectId}
                value={types.includes(addType) ? addType : types[0]}
                onChange={(e) => setAddType(e.target.value)}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {sectionLabel(type)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const type = types.includes(addType) ? addType : types[0];
                onChange([...sections, createEmptySection(type)]);
              }}
            >
              Add section
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Maximum of 24 sections reached.</p>
        )}
      </div>
    </Card>
  );
}
