"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { IconMapPin } from "@/components/ui/icons";
import { Field, SelectInput, TextInput } from "@/components/checkout/checkout-field";
import { ApiError } from "@/lib/api/errors";
import {
  createShopperAddress,
  deleteShopperAddress,
  fetchCountries,
  fetchDistricts,
  fetchShopperAddresses,
  fetchStates,
  setDefaultShopperAddress,
  updateShopperAddress,
  type GeoOption,
  type ShopperAddress,
  type ShopperAddressWriteBody,
} from "@/lib/api/addresses";

const emptyForm = {
  contactName: "",
  contactPhone: "",
  addressLine1: "",
  addressLine2: "",
  landmark: "",
  city: "",
  pincode: "",
  country: "",
  state: "",
  district: "",
  isDefault: false,
};

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function addressPreviewLines(address: ShopperAddress): string[] {
  return [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
  ].filter((part): part is string => Boolean(part?.trim()));
}

export default function AddressesPage() {
  const toast = useToast();
  const [addresses, setAddresses] = useState<ShopperAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<GeoOption[]>([]);
  const [states, setStates] = useState<GeoOption[]>([]);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function reload() {
    const list = await fetchShopperAddresses();
    setAddresses(list);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchShopperAddresses(), fetchCountries()])
      .then(([list, geo]) => {
        if (cancelled) return;
        setAddresses(list);
        setCountries(geo);
        const india = geo.find((c) => c.name.toLowerCase() === "india") ?? geo[0];
        if (india) setForm((prev) => ({ ...prev, country: india.id }));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Unable to load addresses.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!form.country) {
      setStates([]);
      return;
    }
    fetchStates(form.country)
      .then(setStates)
      .catch(() => setStates([]));
  }, [form.country]);

  useEffect(() => {
    if (!form.state) {
      setDistricts([]);
      return;
    }
    fetchDistricts(form.state)
      .then(setDistricts)
      .catch(() => setDistricts([]));
  }, [form.state]);

  function startEdit(address: ShopperAddress) {
    setEditingId(address.id);
    setError(null);
    setForm({
      contactName: address.contactName,
      contactPhone: address.contactPhone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || "",
      landmark: address.landmark || "",
      city: address.city,
      pincode: address.pincode,
      country: address.countryId ?? form.country,
      state: address.stateId ?? "",
      district: address.districtId ?? "",
      isDefault: Boolean(address.isDefault),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm((prev) => ({
      ...emptyForm,
      country: prev.country,
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const line2 = form.addressLine2.trim();
      const landmark = form.landmark.trim();
      const body: ShopperAddressWriteBody = {
        type: "home",
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        contactName: form.contactName.trim(),
        contactPhone: phoneDigits(form.contactPhone),
        country: form.country,
        state: form.state,
        district: form.district,
        isDefault: form.isDefault,
        ...(line2 ? { addressLine2: line2 } : {}),
        ...(landmark ? { landmark } : {}),
      };
      if (editingId) {
        await updateShopperAddress(editingId, body);
        toast.success("Address updated");
      } else {
        await createShopperAddress(body);
        toast.success("Address saved");
      }
      await reload();
      cancelEdit();
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? err.message
          : editingId
            ? "Unable to update this address."
            : "Unable to save this address.";
      setError(message);
      toast.error(editingId ? "Update failed" : "Save failed", message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Spinner /> Loading addresses…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border-b border-border/70 pb-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-[#faf8f4] text-foreground">
          <IconMapPin className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Delivery & Shipping
          </p>
          <h2 className="font-serif text-xl font-normal tracking-tight text-foreground sm:text-2xl">
            Saved Addresses
          </h2>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div>
          {error ? (
            <div className="mb-4 rounded-xl border border-[#ffcdd2] bg-[#fdeded] p-4 text-sm text-[#d32f2f]" role="alert">
              {error}
            </div>
          ) : null}

          {addresses.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-xs">
              <p className="text-sm text-muted-foreground">You do not have any saved addresses yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">Add your delivery address using the form to ensure quick checkout.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {addresses.map((address) => (
                <li
                  key={address.id}
                  className="rounded-2xl border border-border bg-surface p-5 shadow-xs transition-shadow hover:shadow-card sm:p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-base font-medium text-foreground">
                      {address.contactName}
                    </p>
                    {address.isDefault ? (
                      <span className="inline-flex items-center rounded-full border border-accent/20 bg-[#f4efe6] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                        Default
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                    {addressPreviewLines(address).map((line, index) => (
                      <p key={`${address.id}-line-${index}`}>{line}</p>
                    ))}
                    <p>
                      {address.city}
                      {address.districtName ? `, ${address.districtName}` : ""}
                      {address.stateName ? `, ${address.stateName}` : ""} {address.pincode}
                    </p>
                    <p className="pt-1 text-xs font-medium text-foreground/80">{address.contactPhone}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-xs sm:text-sm">
                    <button
                      type="button"
                      className="font-medium text-foreground underline-offset-4 hover:underline hover:text-accent"
                      onClick={() => startEdit(address)}
                    >
                      Edit
                    </button>
                    {!address.isDefault ? (
                      <>
                        <span className="text-border">·</span>
                        <button
                          type="button"
                          className="font-medium text-foreground underline-offset-4 hover:underline hover:text-accent"
                          onClick={() =>
                            setDefaultShopperAddress(address.id)
                              .then(reload)
                              .catch((err: unknown) =>
                                setError(
                                  err instanceof ApiError
                                    ? err.message
                                    : "Unable to set the default address.",
                                ),
                              )
                          }
                        >
                          Set as default
                        </button>
                      </>
                    ) : null}
                    <span className="text-border">·</span>
                    <button
                      type="button"
                      className="font-medium text-sale underline-offset-4 hover:underline"
                      onClick={() =>
                        deleteShopperAddress(address.id)
                          .then(() => {
                            if (editingId === address.id) cancelEdit();
                            return reload();
                          })
                          .catch((err: unknown) =>
                            setError(
                              err instanceof ApiError
                                ? err.message
                                : "Unable to remove this address.",
                            ),
                          )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          className="h-fit space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-xs sm:p-7"
        >
          <div className="border-b border-border/70 pb-3">
            <h3 className="font-serif text-lg font-normal tracking-tight text-foreground sm:text-xl">
              {editingId ? "Edit Address" : "Add New Address"}
            </h3>
          </div>

          <Field id="addr-name" label="Full name">
            <TextInput
              id="addr-name"
              value={form.contactName}
              onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
              required
            />
          </Field>
          <Field id="addr-phone" label="Phone number">
            <TextInput
              id="addr-phone"
              type="tel"
              inputMode="numeric"
              value={form.contactPhone}
              onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
              required
            />
          </Field>
          <Field id="addr-country" label="Country">
            <SelectInput
              id="addr-country"
              value={form.country}
              onChange={(e) =>
                setForm((p) => ({ ...p, country: e.target.value, state: "", district: "" }))
              }
              required
            >
              <option value="">Select country</option>
              {countries.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="addr-state" label="State">
            <SelectInput
              id="addr-state"
              value={form.state}
              disabled={!form.country}
              onChange={(e) => setForm((p) => ({ ...p, state: e.target.value, district: "" }))}
              required
            >
              <option value="">{form.country ? "Select state" : "Select country first"}</option>
              {states.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="addr-district" label="District">
            <SelectInput
              id="addr-district"
              value={form.district}
              disabled={!form.state || districts.length === 0}
              onChange={(e) => setForm((p) => ({ ...p, district: e.target.value }))}
              required={districts.length > 0}
            >
              <option value="">
                {!form.state
                  ? "Select state first"
                  : districts.length === 0
                    ? "No districts available"
                    : "Select district"}
              </option>
              {districts.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field id="addr-city" label="City / Town">
            <TextInput
              id="addr-city"
              value={form.city}
              onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
              required
            />
          </Field>
          <Field id="addr-line1" label="Address line 1">
            <TextInput
              id="addr-line1"
              maxLength={100}
              placeholder="House / Flat / Building, Street"
              value={form.addressLine1}
              onChange={(e) => setForm((p) => ({ ...p, addressLine1: e.target.value }))}
              required
            />
          </Field>
          <Field id="addr-line2" label="Address line 2">
            <TextInput
              id="addr-line2"
              maxLength={100}
              placeholder="Apartment, suite, floor (optional)"
              value={form.addressLine2}
              onChange={(e) => setForm((p) => ({ ...p, addressLine2: e.target.value }))}
            />
          </Field>
          <Field id="addr-landmark" label="Nearest landmark">
            <TextInput
              id="addr-landmark"
              maxLength={50}
              placeholder="Optional landmark"
              value={form.landmark}
              onChange={(e) => setForm((p) => ({ ...p, landmark: e.target.value }))}
            />
          </Field>
          <Field id="addr-pin" label="PIN code">
            <TextInput
              id="addr-pin"
              inputMode="numeric"
              maxLength={6}
              value={form.pincode}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  pincode: e.target.value.replace(/\D/g, "").slice(0, 6),
                }))
              }
              required
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-foreground pt-1 cursor-pointer">
            <input
              type="checkbox"
              className="accent-primary h-4 w-4 rounded"
              checked={form.isDefault}
              onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
            />
            <span>Set as default address</span>
          </label>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update address" : "Save address"}
            </Button>
            {editingId ? (
              <button
                type="button"
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline hover:text-foreground sm:text-sm"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
