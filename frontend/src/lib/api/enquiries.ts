import { apiRequest, unwrapData } from "./client";
import { getShopperToken } from "./token-store";
import {
  buildContactEnquiryPayload,
  buildWellWisherEnquiryPayload,
  validateContactEnquiryInput,
  validateWellWisherEnquiryInput,
  type ContactEnquiryInput,
  type WellWisherEnquiryInput,
} from "./enquiries-payload";

export type {
  ContactEnquiryInput,
  EnquiryCategory,
  WellWisherCategory,
  WellWisherEnquiryInput,
} from "./enquiries-payload";
export {
  buildContactEnquiryPayload,
  buildWellWisherEnquiryPayload,
  CONTACT_ENQUIRY_CATEGORIES,
  CONTACT_FIELD_LABELS,
  contactCategoryLabel,
  validateContactEnquiryInput,
  validateWellWisherEnquiryInput,
  WELL_WISHER_CATEGORIES,
} from "./enquiries-payload";

export type ContactEnquiryResult = {
  enquiryNumber: string;
  status?: string;
  createdAt?: string;
  id?: string;
};

type EnquiryEnvelope = {
  data?: {
    enquiryNumber?: string;
    status?: string;
    createdAt?: string;
    id?: string;
  };
  enquiryNumber?: string;
};

function parseEnquiryResult(response: EnquiryEnvelope): ContactEnquiryResult {
  const data = unwrapData(response);
  const enquiryNumber = String(
    data?.enquiryNumber ?? response.enquiryNumber ?? "",
  ).trim();
  if (!enquiryNumber) {
    throw new Error("Enquiry was submitted but no reference number was returned.");
  }

  return {
    enquiryNumber,
    status: data?.status ? String(data.status) : undefined,
    createdAt: data?.createdAt ? String(data.createdAt) : undefined,
    id: data?.id ? String(data.id) : undefined,
  };
}

/**
 * POST /api/enquiries — auth optional (sends token when present).
 */
export async function submitContactEnquiry(
  input: ContactEnquiryInput,
): Promise<ContactEnquiryResult> {
  const validationError = validateContactEnquiryInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const body = buildContactEnquiryPayload(input);
  const hasToken = Boolean(getShopperToken());
  const response = await apiRequest<EnquiryEnvelope>("/api/enquiries", {
    method: "POST",
    body,
    auth: hasToken ? true : false,
  });

  return parseEnquiryResult(response);
}

/**
 * POST /api/enquiries with source well-wisher (seller category never sent).
 */
export async function submitWellWisherEnquiry(
  input: WellWisherEnquiryInput,
): Promise<ContactEnquiryResult> {
  const validationError = validateWellWisherEnquiryInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const body = buildWellWisherEnquiryPayload(input);
  const hasToken = Boolean(getShopperToken());
  const response = await apiRequest<EnquiryEnvelope>("/api/enquiries", {
    method: "POST",
    body,
    auth: hasToken ? true : false,
  });

  return parseEnquiryResult(response);
}
