"use client";

import Image from "next/image";
import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  Select,
} from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import {
  BANNER_SLOTS,
  createAdminOffer,
  createAdminSlider,
  deleteAdminOffer,
  deleteAdminSlider,
  fetchAdminOffers,
  fetchAdminSliders,
  groupSlidersByPlacement,
  isValidBannerDestination,
  listUnassignedSliders,
  updateAdminOffer,
  updateAdminSlider,
  type AdminOffer,
  type AdminSlider,
  type BannerPlacement,
  type BannerSlotKey,
} from "@/lib/api/promotions";
import { ApiError } from "@/lib/api/errors";
import { isRemoteSrc } from "@/lib/mappers/media";
import { toast } from "@/lib/toast";
import { useAdminResource } from "@/lib/use-admin-resource";

type SlideDraft = {
  heading: string;
  offerText: string;
  buttonText: string;
  buttonLink: string;
  isActive: boolean;
  imageFile: File | null;
  mobileImageFile: File | null;
};

const EMPTY_DRAFT: SlideDraft = {
  heading: "",
  offerText: "",
  buttonText: "",
  buttonLink: "",
  isActive: false,
  imageFile: null,
  mobileImageFile: null,
};

function draftFromSlider(slider: AdminSlider | null): SlideDraft {
  if (!slider) return { ...EMPTY_DRAFT };
  return {
    heading: slider.heading,
    offerText: slider.offerText,
    buttonText: slider.buttonText,
    buttonLink: slider.buttonLink,
    isActive: slider.isActive,
    imageFile: null,
    mobileImageFile: null,
  };
}

type EditorTarget =
  | { mode: "create"; placement: BannerPlacement }
  | { mode: "edit"; placement: BannerPlacement; slider: AdminSlider };

export default function BannersPage() {
  const slidersQuery = useAdminResource(() => fetchAdminSliders(), []);
  const offersQuery = useAdminResource(() => fetchAdminOffers("announcement"), []);
  const [editor, setEditor] = useState<EditorTarget | null>(null);
  const [draft, setDraft] = useState<SlideDraft>(EMPTY_DRAFT);
  const [announcement, setAnnouncement] = useState("");
  const [editingOffer, setEditingOffer] = useState<AdminOffer | null>(null);
  const [offerDraft, setOfferDraft] = useState("");
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);

  const allSliders = slidersQuery.data ?? [];
  const groups = groupSlidersByPlacement(allSliders);
  const unassigned = listUnassignedSliders(allSliders);

  function openCreate(placement: BannerPlacement) {
    setEditor({ mode: "create", placement });
    setDraft({ ...EMPTY_DRAFT });
    setBannerError(null);
  }

  function openEdit(placement: BannerPlacement, slider: AdminSlider) {
    setEditor({ mode: "edit", placement, slider });
    setDraft(draftFromSlider(slider));
    setBannerError(null);
  }

  function closeEditor() {
    setEditor(null);
    setBannerError(null);
  }

  async function saveSlide() {
    if (!editor) return;
    const existing = editor.mode === "edit" ? editor.slider : null;
    const hasDesktop = Boolean(draft.imageFile || existing?.image);
    const hasMobile = Boolean(draft.mobileImageFile || existing?.mobileImage);

    if (draft.isActive && !hasDesktop) {
      setBannerError("A desktop image is required before a slide can be active.");
      return;
    }
    if (draft.isActive && !hasMobile) {
      setBannerError("A mobile image is required before a slide can be active.");
      return;
    }
    if (!existing && !draft.imageFile) {
      setBannerError("Upload a desktop image to create this slide.");
      return;
    }
    if (!isValidBannerDestination(draft.buttonLink)) {
      setBannerError("Destination must be a site path (e.g. /collections) or an http(s) URL.");
      return;
    }

    const sectionSlides = groups[editor.placement as BannerSlotKey] ?? [];
    const nextOrder =
      existing?.displayOrder && existing.displayOrder > 0
        ? existing.displayOrder
        : sectionSlides.length === 0
          ? 1
          : Math.max(...sectionSlides.map((s) => s.displayOrder)) + 1;

    setSavingBanner(true);
    setBannerError(null);
    try {
      const payload = {
        placement: editor.placement,
        heading: draft.heading.trim(),
        offerText: draft.offerText.trim(),
        buttonText: draft.buttonText.trim(),
        buttonLink: draft.buttonLink.trim(),
        isActive: draft.isActive,
        displayOrder: nextOrder,
      };
      if (existing) {
        await updateAdminSlider(existing.id, {
          ...payload,
          image: draft.imageFile || undefined,
          mobileImage: draft.mobileImageFile || undefined,
        });
      } else if (draft.imageFile) {
        await createAdminSlider({
          ...payload,
          image: draft.imageFile,
          mobileImage: draft.mobileImageFile || undefined,
        });
      }
      closeEditor();
      toast.success(existing ? "Slide updated" : "Slide created");
      await slidersQuery.reload();
    } catch (err) {
      setBannerError(err instanceof ApiError ? err.message : "Unable to save slide.");
    } finally {
      setSavingBanner(false);
    }
  }

  async function removeSlide(slider: AdminSlider) {
    if (!window.confirm("Delete this slide? This cannot be undone.")) return;
    setSavingBanner(true);
    setBannerError(null);
    try {
      await deleteAdminSlider(slider.id);
      if (editor?.mode === "edit" && editor.slider.id === slider.id) closeEditor();
      toast.success("Slide deleted");
      await slidersQuery.reload();
    } catch (err) {
      setBannerError(err instanceof ApiError ? err.message : "Unable to delete slide.");
    } finally {
      setSavingBanner(false);
    }
  }

  async function moveSlide(placement: BannerSlotKey, slider: AdminSlider, direction: -1 | 1) {
    const list = [...(groups[placement] ?? [])];
    const index = list.findIndex((s) => s.id === slider.id);
    const swapWith = index + direction;
    if (index < 0 || swapWith < 0 || swapWith >= list.length) return;

    const a = list[index]!;
    const b = list[swapWith]!;
    const orderA = a.displayOrder;
    const orderB = b.displayOrder;
    const tempOrder =
      Math.max(0, ...list.map((s) => s.displayOrder), orderA, orderB) + 100;

    setSavingBanner(true);
    setBannerError(null);
    try {
      const baseA = {
        placement: a.placement as BannerPlacement,
        heading: a.heading,
        offerText: a.offerText,
        buttonText: a.buttonText,
        buttonLink: a.buttonLink,
        isActive: a.isActive,
      };
      const baseB = {
        placement: b.placement as BannerPlacement,
        heading: b.heading,
        offerText: b.offerText,
        buttonText: b.buttonText,
        buttonLink: b.buttonLink,
        isActive: b.isActive,
      };
      // Temp order avoids active uniqueness conflict while swapping.
      await updateAdminSlider(a.id, { ...baseA, displayOrder: tempOrder });
      await updateAdminSlider(b.id, { ...baseB, displayOrder: orderA });
      await updateAdminSlider(a.id, { ...baseA, displayOrder: orderB });
      toast.success("Slides reordered");
      await slidersQuery.reload();
    } catch (err) {
      setBannerError(err instanceof ApiError ? err.message : "Unable to reorder slides.");
    } finally {
      setSavingBanner(false);
    }
  }

  async function saveNewAnnouncement() {
    if (!announcement.trim()) {
      setOfferError("Announcement text is required.");
      return;
    }
    if (announcement.trim().length < 3) {
      setOfferError("Announcement text must be at least 3 characters.");
      return;
    }
    setSavingOffer(true);
    setOfferError(null);
    try {
      await createAdminOffer(announcement.trim());
      setAnnouncement("");
      toast.success("Announcement added");
      await offersQuery.reload();
    } catch (err) {
      setOfferError(err instanceof ApiError ? err.message : "Unable to save announcement.");
    } finally {
      setSavingOffer(false);
    }
  }

  async function saveOfferEdit() {
    if (!editingOffer) return;
    if (!offerDraft.trim() || offerDraft.trim().length < 3) {
      setOfferError("Announcement text must be at least 3 characters.");
      return;
    }
    setSavingOffer(true);
    setOfferError(null);
    try {
      await updateAdminOffer(editingOffer.id, { text: offerDraft.trim(), isActive: true });
      setEditingOffer(null);
      setOfferDraft("");
      toast.success("Announcement updated");
      await offersQuery.reload();
    } catch (err) {
      setOfferError(err instanceof ApiError ? err.message : "Unable to update announcement.");
    } finally {
      setSavingOffer(false);
    }
  }

  async function setOfferActive(offer: AdminOffer, isActive: boolean) {
    setSavingOffer(true);
    setOfferError(null);
    try {
      await updateAdminOffer(offer.id, { isActive });
      toast.success(isActive ? "Announcement activated" : "Announcement deactivated");
      await offersQuery.reload();
    } catch (err) {
      setOfferError(err instanceof ApiError ? err.message : "Unable to update announcement.");
    } finally {
      setSavingOffer(false);
    }
  }

  async function removeOffer(offer: AdminOffer) {
    if (!window.confirm("Delete this announcement? This cannot be undone.")) return;
    setSavingOffer(true);
    setOfferError(null);
    try {
      await deleteAdminOffer(offer.id);
      if (editingOffer?.id === offer.id) {
        setEditingOffer(null);
        setOfferDraft("");
      }
      toast.success("Announcement deleted");
      await offersQuery.reload();
    } catch (err) {
      setOfferError(err instanceof ApiError ? err.message : "Unable to delete announcement.");
    } finally {
      setSavingOffer(false);
    }
  }

  const offers = offersQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="Banners"
        description="Hero, Promotional 1, and Promotional 2 each have their own slider (0–N slides). Announcements stay separate."
      />

      {bannerError ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {bannerError}
        </p>
      ) : null}

      {slidersQuery.loading ? (
        <Card>
          <LoadingState message="Loading banners…" />
        </Card>
      ) : slidersQuery.error ? (
        <Card>
          <ErrorState message={slidersQuery.error} onRetry={() => void slidersQuery.reload()} />
        </Card>
      ) : (
        <div className="space-y-6">
          {BANNER_SLOTS.map((slot) => {
            const slides = groups[slot.key];
            const isEditingSection =
              editor?.placement === slot.placement &&
              (editor.mode === "create" || editor.mode === "edit");

            return (
              <Card key={slot.key} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <p className="font-semibold">{slot.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Placement: {slot.placement} · {slides.length} slide
                      {slides.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => openCreate(slot.placement)}
                    disabled={savingBanner}
                  >
                    Add slide
                  </Button>
                </div>

                {isEditingSection ? (
                  <div className="space-y-3 border-b border-border p-4">
                    <p className="text-sm font-medium">
                      {editor?.mode === "create" ? "New slide" : "Edit slide"}
                    </p>
                    <SlideForm
                      slotKey={slot.key}
                      draft={draft}
                      setDraft={setDraft}
                      existing={editor?.mode === "edit" ? editor.slider : null}
                    />
                    <div className="flex gap-2">
                      <Button onClick={() => void saveSlide()} disabled={savingBanner}>
                        {savingBanner ? "Saving…" : "Save slide"}
                      </Button>
                      <Button variant="secondary" onClick={closeEditor}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {slides.length === 0 ? (
                  <div className="p-4">
                    <EmptyState message="No slides in this section yet. Use Add slide when creative is ready." />
                  </div>
                ) : (
                  <ul className="divide-y divide-border">
                    {slides.map((slider, index) => (
                      <li
                        key={slider.id}
                        className="flex flex-wrap items-stretch gap-3 p-4 sm:flex-nowrap"
                      >
                        <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-[var(--radius-md)] bg-muted sm:w-40">
                          {slider.image ? (
                            <Image
                              src={slider.image}
                              alt={slider.heading || slot.label}
                              fill
                              className="object-cover"
                              sizes="160px"
                              unoptimized={isRemoteSrc(slider.image)}
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge
                              status={slider.isActive ? "Active" : "Inactive"}
                              kind="entity"
                            />
                            <span className="text-xs text-muted-foreground">
                              Order {slider.displayOrder}
                            </span>
                          </div>
                          <p className="mt-1 font-medium">
                            {slider.heading || "No heading"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            CTA: {slider.buttonText || "—"}
                            {slider.buttonLink ? ` → ${slider.buttonLink}` : ""}
                          </p>
                          {!slider.mobileImage ? (
                            <p className="mt-1 text-xs text-danger">
                              Mobile image missing — required to keep active.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 sm:flex-col">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={savingBanner || index === 0}
                            onClick={() => void moveSlide(slot.key, slider, -1)}
                          >
                            Move up
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={savingBanner || index === slides.length - 1}
                            onClick={() => void moveSlide(slot.key, slider, 1)}
                          >
                            Move down
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(slot.placement, slider)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={savingBanner}
                            onClick={() => void removeSlide(slider)}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}

          {unassigned.length > 0 ? (
            <Card className="overflow-hidden border-danger/40">
              <div className="border-b border-border px-4 py-3">
                <p className="font-semibold text-danger">Unassigned slides</p>
                <p className="text-xs text-muted-foreground">
                  These records have no placement and are hidden from homepage sections. Delete or
                  re-create under Hero / Promo 1 / Promo 2.
                </p>
              </div>
              <ul className="divide-y divide-border">
                {unassigned.map((slider) => (
                  <li
                    key={slider.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {slider.heading || "No heading"} (order {slider.displayOrder})
                      </p>
                      <p className="text-xs text-muted-foreground">{slider.id}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingBanner}
                      onClick={() => void removeSlide(slider)}
                    >
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      )}

      <Card className="mt-6">
        <div className="border-b border-border px-4 py-3.5">
          <h2 className="text-base font-semibold">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            Homepage announcement offers. Separate from banner sliders.
          </p>
        </div>
        <div className="space-y-3 p-4">
          {offerError ? (
            <p className="text-sm text-danger" role="alert">
              {offerError}
            </p>
          ) : null}
          <Field label="New announcement" htmlFor="announcement">
            <Input
              id="announcement"
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
              placeholder="Paste approved announcement text"
            />
          </Field>
          <Button onClick={() => void saveNewAnnouncement()} disabled={savingOffer}>
            {savingOffer ? "Saving…" : "Add announcement"}
          </Button>

          {editingOffer ? (
            <div className="space-y-2 rounded-[var(--radius-md)] border border-border p-3">
              <Field label="Edit announcement" htmlFor="edit-offer">
                <Input
                  id="edit-offer"
                  value={offerDraft}
                  onChange={(e) => setOfferDraft(e.target.value)}
                />
              </Field>
              <div className="flex gap-2">
                <Button onClick={() => void saveOfferEdit()} disabled={savingOffer}>
                  {savingOffer ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingOffer(null);
                    setOfferDraft("");
                    setOfferError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {offersQuery.loading ? (
            <LoadingState message="Loading announcements…" />
          ) : offersQuery.error ? (
            <ErrorState message={offersQuery.error} onRetry={() => void offersQuery.reload()} />
          ) : offers.length === 0 ? (
            <EmptyState message="No announcements yet." />
          ) : (
            <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
              {offers.map((offer) => (
                <li
                  key={offer.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
                >
                  <div>
                    <p className="text-sm">{offer.text || offer.title || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {offer.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditingOffer(offer);
                        setOfferDraft(offer.text || offer.title);
                        setOfferError(null);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingOffer}
                      onClick={() => void setOfferActive(offer, !offer.isActive)}
                    >
                      {offer.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingOffer}
                      onClick={() => void removeOffer(offer)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function SlideForm({
  slotKey,
  draft,
  setDraft,
  existing,
}: {
  slotKey: string;
  draft: SlideDraft;
  setDraft: Dispatch<SetStateAction<SlideDraft>>;
  existing: AdminSlider | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Heading (optional)" htmlFor={`${slotKey}-heading`}>
        <Input
          id={`${slotKey}-heading`}
          value={draft.heading}
          onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))}
        />
      </Field>
      <Field label="Caption / offer text (optional)" htmlFor={`${slotKey}-offer`}>
        <Input
          id={`${slotKey}-offer`}
          value={draft.offerText}
          onChange={(e) => setDraft((d) => ({ ...d, offerText: e.target.value }))}
        />
      </Field>
      <Field label="CTA label (optional)" htmlFor={`${slotKey}-cta`}>
        <Input
          id={`${slotKey}-cta`}
          value={draft.buttonText}
          onChange={(e) => setDraft((d) => ({ ...d, buttonText: e.target.value }))}
        />
      </Field>
      <Field label="Destination (optional)" htmlFor={`${slotKey}-href`}>
        <Input
          id={`${slotKey}-href`}
          value={draft.buttonLink}
          onChange={(e) => setDraft((d) => ({ ...d, buttonLink: e.target.value }))}
          placeholder="/collections or https://…"
        />
      </Field>
      <Field label="Visibility" htmlFor={`${slotKey}-status`}>
        <Select
          id={`${slotKey}-status`}
          value={draft.isActive ? "Active" : "Inactive"}
          onChange={(e) =>
            setDraft((d) => ({ ...d, isActive: e.target.value === "Active" }))
          }
        >
          <option>Inactive</option>
          <option>Active</option>
        </Select>
      </Field>
      <div />
      <Field
        label={`Desktop image${draft.isActive ? " (required when active)" : ""}`}
        htmlFor={`${slotKey}-image`}
      >
        <Input
          id={`${slotKey}-image`}
          type="file"
          accept="image/*"
          onChange={(e) =>
            setDraft((d) => ({ ...d, imageFile: e.target.files?.[0] ?? null }))
          }
        />
        {existing?.image && !draft.imageFile ? (
          <p className="mt-1 text-xs text-muted-foreground">Current desktop kept if unchanged.</p>
        ) : null}
      </Field>
      <Field
        label={`Mobile image${draft.isActive ? " (required when active)" : ""}`}
        htmlFor={`${slotKey}-mobile`}
      >
        <Input
          id={`${slotKey}-mobile`}
          type="file"
          accept="image/*"
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              mobileImageFile: e.target.files?.[0] ?? null,
            }))
          }
        />
        {existing?.mobileImage && !draft.mobileImageFile ? (
          <p className="mt-1 text-xs text-muted-foreground">Current mobile kept if unchanged.</p>
        ) : null}
      </Field>
    </div>
  );
}
