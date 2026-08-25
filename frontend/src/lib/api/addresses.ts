import { apiRequest, unwrapData } from "./client";
import { idString } from "../mappers/media";

export type ShopperAddress = {
  id: string;
  type?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  pincode: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  isDefault?: boolean;
  countryId?: string;
  stateId?: string;
  districtId?: string;
  countryName?: string;
  stateName?: string;
  districtName?: string;
};

export type GeoOption = { id: string; name: string };

type Envelope<T> = { data?: T; success?: boolean };

function namedId(raw: unknown): { id?: string; name?: string } {
  if (!raw) return {};
  if (typeof raw === "string") return { id: raw };
  if (typeof raw === "object") {
    const rec = raw as { _id?: unknown; id?: unknown; name?: string };
    return { id: idString(rec._id ?? rec.id), name: rec.name };
  }
  return {};
}

export function mapShopperAddress(raw: unknown): ShopperAddress | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const id = idString(rec._id ?? rec.id);
  if (!id) return null;
  const country = namedId(rec.country);
  const state = namedId(rec.state);
  const district = namedId(rec.district);
  return {
    id,
    type: typeof rec.type === "string" ? rec.type : undefined,
    addressLine1: String(rec.addressLine1 ?? ""),
    addressLine2: rec.addressLine2 ? String(rec.addressLine2) : undefined,
    landmark: rec.landmark ? String(rec.landmark) : undefined,
    city: String(rec.city ?? ""),
    pincode: String(rec.pincode ?? ""),
    contactName: String(rec.contactName ?? ""),
    contactPhone: String(rec.contactPhone ?? ""),
    contactEmail: rec.contactEmail ? String(rec.contactEmail) : undefined,
    isDefault: Boolean(rec.isDefault),
    countryId: country.id,
    stateId: state.id,
    districtId: district.id,
    countryName: country.name,
    stateName: state.name,
    districtName: district.name,
  };
}

function mapGeoList(raw: unknown): GeoOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const rec = item as { _id?: unknown; id?: unknown; name?: string };
      const id = idString(rec._id ?? rec.id);
      if (!id) return null;
      return { id, name: String(rec.name ?? "") };
    })
    .filter((item): item is GeoOption => Boolean(item));
}

export async function fetchShopperAddresses(): Promise<ShopperAddress[]> {
  const response = await apiRequest<Envelope<unknown>>("/api/addresses/shopper", {
    auth: true,
  });
  const data = unwrapData(response);
  if (!Array.isArray(data)) return [];
  return data.map(mapShopperAddress).filter((item): item is ShopperAddress => Boolean(item));
}

export async function fetchDefaultShopperAddress(): Promise<ShopperAddress | null> {
  try {
    const response = await apiRequest<Envelope<unknown>>("/api/addresses/shopper/default", {
      auth: true,
    });
    return mapShopperAddress(unwrapData(response));
  } catch {
    return null;
  }
}

export type ShopperAddressWriteBody = {
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  pincode: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  country: string;
  state: string;
  district: string;
  type?: string;
  isDefault?: boolean;
};

export async function createShopperAddress(body: ShopperAddressWriteBody): Promise<ShopperAddress> {
  const response = await apiRequest<Envelope<unknown>>("/api/addresses/shopper", {
    method: "POST",
    auth: true,
    body,
  });
  const mapped = mapShopperAddress(unwrapData(response));
  if (!mapped) throw new Error("Address was saved without an identifier.");
  return mapped;
}

export async function updateShopperAddress(
  id: string,
  body: ShopperAddressWriteBody,
): Promise<ShopperAddress> {
  const response = await apiRequest<Envelope<unknown>>(
    `/api/addresses/shopper/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      auth: true,
      body,
    },
  );
  const mapped = mapShopperAddress(unwrapData(response));
  if (!mapped) throw new Error("Address was updated without an identifier.");
  return mapped;
}

export async function setDefaultShopperAddress(id: string): Promise<void> {
  await apiRequest(`/api/addresses/shopper/${encodeURIComponent(id)}/default`, {
    method: "PATCH",
    auth: true,
  });
}

export async function deleteShopperAddress(id: string): Promise<void> {
  await apiRequest(`/api/addresses/shopper/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchCountries(): Promise<GeoOption[]> {
  const response = await apiRequest<Envelope<unknown>>("/api/addresses/countries", {
    auth: false,
  });
  return mapGeoList(unwrapData(response));
}

export async function fetchStates(countryId: string): Promise<GeoOption[]> {
  const response = await apiRequest<Envelope<unknown>>(
    `/api/addresses/states/${encodeURIComponent(countryId)}`,
    { auth: false },
  );
  return mapGeoList(unwrapData(response));
}

export async function fetchDistricts(stateId: string): Promise<GeoOption[]> {
  const response = await apiRequest<Envelope<unknown>>(
    `/api/addresses/districts/${encodeURIComponent(stateId)}`,
    { auth: false },
  );
  return mapGeoList(unwrapData(response));
}
