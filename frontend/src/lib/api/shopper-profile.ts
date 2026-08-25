import { apiRequest } from "./client";
import type { ShopperSessionUser } from "./token-store";
import { setShopperSession, getShopperToken } from "./token-store";

type ProfileResponse = {
  shopper?: ShopperSessionUser & { _id?: string };
};

function normalizeUser(raw: ShopperSessionUser & { _id?: string; id?: string }): ShopperSessionUser {
  return {
    id: String(raw.id ?? raw._id ?? ""),
    firstName: raw.firstName,
    lastName: raw.lastName,
    username: raw.username,
    email: raw.email,
    phone: raw.phone,
    profileImage: raw.profileImage,
  };
}

export async function updateShopperProfile(body: {
  firstName: string;
  lastName: string;
  username: string;
  phone: string;
}): Promise<ShopperSessionUser> {
  const response = await apiRequest<ProfileResponse>("/api/shopper/update-profile", {
    method: "PUT",
    auth: true,
    body,
  });
  if (!response.shopper) {
    throw new Error("Profile update returned an empty shopper.");
  }
  const user = normalizeUser(response.shopper);
  const token = getShopperToken();
  if (token) setShopperSession(token, user);
  return user;
}
