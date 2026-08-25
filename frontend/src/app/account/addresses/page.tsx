"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
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
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Loading addresses…
      </p>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,400px)]">
      <div>
        <h2 className="font-serif text-2xl tracking-tight">Saved addresses</h2>
        {error ? (
          <p className="mt-3 text-sm text-sale" role="alert">
            {error}
          </p>
        ) : null}
        {addresses.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No addresses yet.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {addresses.map((address) => (
              <li
                key={address.id}
                className="rounded-card border border-border bg-surface p-4"
              >
                <p className="text-sm font-medium">
                  {address.contactName}
                  {address.isDefault ? (
                    <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Default
                    </span>
                  ) : null}
                </p>
                <div className="mt-1 text-sm text-muted-foreground">
                  {addressPreviewLines(address).map((line, index) => (
                    <p key={`${address.id}-line-${index}`}>{line}</p>
                  ))}
                  <p>
                    {address.city}
                    {address.districtName ? `, ${address.districtName}` : ""}
                    {address.stateName ? `, ${address.stateName}` : ""} {address.pincode}
                  </p>
                  <p>{address.contactPhone}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-sm underline-offset-4 hover:underline"
                    onClick={() => startEdit(address)}
                  >
                    Edit
                  </button>
                  {!address.isDefault ? (
                    <button
                      type="button"
                      className="text-sm underline-offset-4 hover:underline"
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
                  ) : null}
                  <button
                    type="button"
                    className="text-sm text-sale underline-offset-4 hover:underline"
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
        className="h-fit space-y-4 rounded-card border border-border bg-surface p-5"
      >
        <h3 className="font-serif text-xl tracking-tight">
          {editingId ? "Edit address" : "Add address"}
        </h3>
        <Field id="addr-name" label="Full name">
          <TextInput
            id="addr-name"
            value={form.contactName}
            onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
            required
          />
        </Field>
        <Field id="addr-phone" label="Phone">
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
            placeholder="House / flat, street"
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
            placeholder="Optional"
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
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-primary"
            checked={form.isDefault}
            onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
          />
          Set as default
        </label>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update address" : "Save address"}
          </Button>
          {editingId ? (
            <button
              type="button"
              className="text-sm underline-offset-4 hover:underline"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
