import { apiRequest, unwrapData } from "./client";

export type PhonePeInitiateResult = {
  redirectUrl: string;
  transactionId?: string;
  orderId?: string;
};

export type PhonePeVerifyResult = {
  status?: string;
  orderStatus?: string;
  success?: boolean;
  message?: string;
};

export async function initiatePhonePePayment(orderId: string): Promise<PhonePeInitiateResult> {
  const response = await apiRequest<{ data?: PhonePeInitiateResult } & PhonePeInitiateResult>(
    "/api/payment/initiate",
    { method: "POST", auth: true, body: { orderId } },
  );
  const data = unwrapData(response) as PhonePeInitiateResult;
  if (!data.redirectUrl) {
    throw new Error("PhonePe did not return a redirect URL.");
  }
  return data;
}

export async function verifyPhonePePayment(orderId: string): Promise<PhonePeVerifyResult> {
  return apiRequest<PhonePeVerifyResult>("/api/payment/verify", {
    method: "POST",
    auth: true,
    body: { orderId },
  });
}
