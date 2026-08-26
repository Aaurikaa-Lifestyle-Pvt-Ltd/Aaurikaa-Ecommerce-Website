"use client";

import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Textarea,
} from "@/components/ui";
import {
  CardGridEditor,
  CtaEditor,
  HeroBannerEditor,
  ImageBlockEditor,
  ImageTextEditor,
  OrderedSectionsEditor,
} from "@/components/cms-zone-editors";
import { ProductStructuredEditor } from "@/components/product-structured-editor";
import type { CmsManifestZone } from "@/lib/api/cms";
import {
  editableTextToTiptapJson,
  richTextValueToEditorString,
} from "@/lib/tiptap-plain";
import type {
  AdminManufacturerConditions,
  AdminProductFeature,
  AdminProductQanda,
} from "@/types/admin";

type FaqItem = { category?: string; q?: string; a?: string };
type SectionItem = { title?: string; bodyRichText?: string };
type ContactCard = {
  heading?: string;
  intro?: string;
  organizationName?: string;
  phone?: string;
  email?: string;
  addressLines?: string[];
  buttonLabel?: string;
  buttonHref?: string;
};
type SupportAction = { label?: string; href?: string };
type SupportPanel = {
  heading?: string;
  description?: string;
  actions?: SupportAction[];
};

function asObject<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : fallback;
}

export type StructuredZoneProps = {
  zone: CmsManifestZone;
  value: unknown;
  onChange: (value: unknown) => void;
};

/**
 * Business-friendly content block editor for CMS zones.
 * Avoids technical jargon in normal workflows.
 */
export function StructuredEditor({ zone, value, onChange }: StructuredZoneProps) {
  if (zone.type === "plainText") {
    return (
      <Card>
        <CardHeader title={zone.label || zone.id} />
        <div className="p-4 sm:p-5">
          <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
        </div>
      </Card>
    );
  }

  if (zone.type === "heroBanner") {
    return (
      <HeroBannerEditor
        title={zone.label || zone.id}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (zone.type === "image") {
    return (
      <ImageBlockEditor title={zone.label || zone.id} value={value} onChange={onChange} />
    );
  }

  if (zone.type === "imageText") {
    return (
      <ImageTextEditor title={zone.label || zone.id} value={value} onChange={onChange} />
    );
  }

  if (zone.type === "cardGrid") {
    return (
      <CardGridEditor title={zone.label || zone.id} value={value} onChange={onChange} />
    );
  }

  if (zone.type === "orderedSections") {
    return (
      <OrderedSectionsEditor
        title={zone.label || zone.id}
        allowedTypes={zone.allowedSectionTypes ?? []}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (zone.type === "cta" || zone.type === "ctaCard") {
    return (
      <CtaEditor title={zone.label || zone.id} value={value} onChange={onChange} />
    );
  }

  if (zone.type === "faqList") {
    const items = Array.isArray(value) ? (value as FaqItem[]) : [];
    return (
      <Card>
        <CardHeader
          title={zone.label || zone.id}
          description="Empty until approved FAQ copy is supplied."
        />
        <div className="space-y-3 p-4 sm:p-5">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-[var(--radius-md)] border border-border p-3">
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
          <Button variant="secondary" onClick={() => onChange([...items, { category: "", q: "", a: "" }])}>
            Add FAQ item
          </Button>
        </div>
      </Card>
    );
  }

  if (zone.type === "sectionList") {
    const items = Array.isArray(value) ? (value as SectionItem[]) : [];
    return (
      <Card>
        <CardHeader
          title={zone.label || zone.id}
          description="Each section has a title and body text."
        />
        <div className="space-y-3 p-4 sm:p-5">
          {items.map((item, index) => (
            <div key={index} className="grid gap-2 rounded-[var(--radius-md)] border border-border p-3">
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
              <Field label="Body">
                <ProductStructuredEditor
                  value={richTextValueToEditorString(item.bodyRichText)}
                  onChange={(bodyRichText) => {
                    const next = [...items];
                    next[index] = { ...next[index], bodyRichText };
                    onChange(next);
                  }}
                  context="CMS"
                  placeholder="Write section body…"
                  minHeight={160}
                />
              </Field>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                Remove section
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() =>
              onChange([
                ...items,
                { title: "", bodyRichText: editableTextToTiptapJson("") },
              ])
            }
          >
            Add section
          </Button>
        </div>
      </Card>
    );
  }

  if (zone.type === "contactCard") {
    const card = asObject<ContactCard>(value, {
      heading: "",
      intro: "",
      organizationName: "",
      phone: "",
      email: "",
      addressLines: [],
      buttonLabel: "",
      buttonHref: "",
    });
    const addressText = Array.isArray(card.addressLines) ? card.addressLines.join("\n") : "";
    return (
      <Card>
        <CardHeader
          title={zone.label || zone.id}
          description="Contact details shown on the page (heading required to publish)."
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Heading" className="sm:col-span-2">
            <Input
              value={card.heading ?? ""}
              onChange={(e) => onChange({ ...card, heading: e.target.value })}
            />
          </Field>
          <Field label="Intro" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={card.intro ?? ""}
              onChange={(e) => onChange({ ...card, intro: e.target.value })}
            />
          </Field>
          <Field label="Organization">
            <Input
              value={card.organizationName ?? ""}
              onChange={(e) => onChange({ ...card, organizationName: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={card.phone ?? ""}
              onChange={(e) => onChange({ ...card, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={card.email ?? ""}
              onChange={(e) => onChange({ ...card, email: e.target.value })}
            />
          </Field>
          <Field label="Button label">
            <Input
              value={card.buttonLabel ?? ""}
              onChange={(e) => onChange({ ...card, buttonLabel: e.target.value })}
            />
          </Field>
          <Field label="Address lines (one per line)" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={addressText}
              onChange={(e) =>
                onChange({
                  ...card,
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
              value={card.buttonHref ?? ""}
              onChange={(e) => onChange({ ...card, buttonHref: e.target.value })}
              placeholder="/contact or https://…"
            />
          </Field>
        </div>
      </Card>
    );
  }

  if (zone.type === "supportPanel") {
    const panel = asObject<SupportPanel>(value, {
      heading: "",
      description: "",
      actions: [{ label: "", href: "" }],
    });
    const actions = Array.isArray(panel.actions) ? panel.actions : [{ label: "", href: "" }];
    return (
      <Card>
        <CardHeader
          title={zone.label || zone.id}
          description="Support links panel. Heading and 1–4 actions with label and link are required."
        />
        <div className="space-y-3 p-4 sm:p-5">
          <Field label="Heading">
            <Input
              value={panel.heading ?? ""}
              onChange={(e) => onChange({ ...panel, heading: e.target.value, actions })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={3}
              value={panel.description ?? ""}
              onChange={(e) => onChange({ ...panel, description: e.target.value, actions })}
            />
          </Field>
          {actions.map((action, index) => (
            <div key={index} className="grid gap-2 rounded-[var(--radius-md)] border border-border p-3 sm:grid-cols-2">
              <Field label="Action label">
                <Input
                  value={action.label ?? ""}
                  onChange={(e) => {
                    const next = [...actions];
                    next[index] = { ...next[index], label: e.target.value };
                    onChange({ ...panel, actions: next });
                  }}
                />
              </Field>
              <Field label="Action link">
                <Input
                  value={action.href ?? ""}
                  onChange={(e) => {
                    const next = [...actions];
                    next[index] = { ...next[index], href: e.target.value };
                    onChange({ ...panel, actions: next });
                  }}
                />
              </Field>
              {actions.length > 1 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="sm:col-span-2"
                  onClick={() =>
                    onChange({
                      ...panel,
                      actions: actions.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove action
                </Button>
              ) : null}
            </div>
          ))}
          {actions.length < 4 ? (
            <Button
              variant="secondary"
              onClick={() => onChange({ ...panel, actions: [...actions, { label: "", href: "" }] })}
            >
              Add action
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  if (zone.type === "richText") {
    return (
      <Card>
        <CardHeader
          title={zone.label || zone.id}
          description="Write and format body copy. Do not invent policy or legal text."
        />
        <div className="p-4 sm:p-5">
          <ProductStructuredEditor
            value={richTextValueToEditorString(value)}
            onChange={onChange}
            context="CMS"
            placeholder="Write page body copy…"
            minHeight={220}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title={zone.label || zone.id}
        description="Advanced content — edit carefully. Prefer structured fields when available."
      />
      <div className="p-4 sm:p-5">
        <Textarea
          rows={8}
          value={typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(e) => {
            const text = e.target.value;
            try {
              onChange(JSON.parse(text));
            } catch {
              onChange(text);
            }
          }}
        />
      </div>
    </Card>
  );
}

export type ProductContentEditorProps = {
  description: string;
  onDescriptionChange: (value: string) => void;
  usageSafetyContent: string;
  onUsageSafetyContentChange: (value: string) => void;
  manufacturerConditions: AdminManufacturerConditions;
  onManufacturerConditionsChange: (value: AdminManufacturerConditions) => void;
  features: AdminProductFeature[];
  onFeaturesChange: (value: AdminProductFeature[]) => void;
  qandas: AdminProductQanda[];
  onQandasChange: (value: AdminProductQanda[]) => void;
};

/**
 * Product content blocks reusing StructuredEditor field patterns.
 * Maps to existing product fields only — not a page builder.
 */
export function ProductContentEditor({
  description,
  onDescriptionChange,
  usageSafetyContent,
  onUsageSafetyContentChange,
  manufacturerConditions,
  onManufacturerConditionsChange,
  features,
  onFeaturesChange,
  qandas,
  onQandasChange,
}: ProductContentEditorProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Product Description"
          description="Shown on the product page."
        />
        <div className="space-y-4 p-4 sm:p-5">
          <ProductStructuredEditor
            value={description}
            onChange={onDescriptionChange}
            context="PRODUCT"
            placeholder="Write the product description…"
          />
          <p className="text-xs text-muted-foreground">
            Occasion labels on the storefront come from Occasions merchandising
            (products linked to an occasion) — not a field on this form.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Care"
          description="Care guidance for the product page."
        />
        <div className="space-y-4 p-4 sm:p-5">
          <ProductStructuredEditor
            value={usageSafetyContent}
            onChange={onUsageSafetyContentChange}
            context="PRODUCT"
            minHeight={140}
            placeholder="Care and safety guidance shown on the product page…"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Manufacturer Details"
          description="Maker or brand narrative shown on the product page."
        />
        <div className="p-4 sm:p-5">
          <ProductStructuredEditor
            value={manufacturerConditions.details ?? ""}
            onChange={(details) =>
              onManufacturerConditionsChange({
                ...manufacturerConditions,
                details,
              })
            }
            context="PRODUCT"
            minHeight={140}
            placeholder="Manufacturer narrative for the product page…"
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Key Features"
          description="Short label and value pairs shown on the product page (for example Metal: 22K Gold)."
        />
        <div className="space-y-3 p-4 sm:p-5">
          {features.length === 0 ? (
            <p className="text-sm text-muted-foreground">No key features yet.</p>
          ) : (
            features.map((feature, index) => (
              <div key={`feature-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={feature.key}
                  placeholder="Label"
                  onChange={(e) => {
                    const next = features.map((row, i) =>
                      i === index ? { ...row, key: e.target.value } : row,
                    );
                    onFeaturesChange(next);
                  }}
                  aria-label={`Feature label ${index + 1}`}
                />
                <Input
                  value={feature.value}
                  placeholder="Value"
                  onChange={(e) => {
                    const next = features.map((row, i) =>
                      i === index ? { ...row, value: e.target.value } : row,
                    );
                    onFeaturesChange(next);
                  }}
                  aria-label={`Feature value ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onFeaturesChange(features.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onFeaturesChange([...features, { key: "", value: "" }])}
          >
            Add feature
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="FAQ / Q&A"
          description="Questions and answers shown on the product page."
        />
        <div className="space-y-3 p-4 sm:p-5">
          {qandas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Q&A rows yet.</p>
          ) : (
            qandas.map((row, index) => (
              <div key={`qanda-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={row.question}
                  placeholder="Question"
                  onChange={(e) => {
                    const next = qandas.map((item, i) =>
                      i === index ? { ...item, question: e.target.value } : item,
                    );
                    onQandasChange(next);
                  }}
                  aria-label={`Question ${index + 1}`}
                />
                <Input
                  value={row.answer}
                  placeholder="Answer"
                  onChange={(e) => {
                    const next = qandas.map((item, i) =>
                      i === index ? { ...item, answer: e.target.value } : item,
                    );
                    onQandasChange(next);
                  }}
                  aria-label={`Answer ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onQandasChange(qandas.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onQandasChange([...qandas, { question: "", answer: "" }])}
          >
            Add Q&A
          </Button>
        </div>
      </Card>
    </div>
  );
}

