const fetch = require("node-fetch");

/**
 * PhonePe Standard Checkout V2 only (OAuth client credentials + checkout/order APIs).
 */
class PhonePeService {
  isV2Enabled() {
    return Boolean(
      process.env.PHONEPE_CLIENT_ID &&
        process.env.PHONEPE_CLIENT_SECRET &&
        process.env.PHONEPE_CLIENT_VERSION
    );
  }

  getV2Config() {
    const clientId = process.env.PHONEPE_CLIENT_ID;
    const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
    const clientVersion = process.env.PHONEPE_CLIENT_VERSION;
    const env = (process.env.PHONEPE_ENV || "UAT").toUpperCase();

    const missing = [];
    if (!clientId) missing.push("PHONEPE_CLIENT_ID");
    if (!clientSecret) missing.push("PHONEPE_CLIENT_SECRET");
    if (!clientVersion) missing.push("PHONEPE_CLIENT_VERSION");
    if (missing.length > 0) {
      throw new Error(`Missing required PhonePe V2 env vars: ${missing.join(", ")}`);
    }

    const oauthTokenUrl =
      env === "PROD"
        ? "https://api.phonepe.com/apis/identity-manager/v1/oauth/token"
        : "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token";

    const checkoutPayUrl =
      env === "PROD"
        ? "https://api.phonepe.com/apis/pg/checkout/v2/pay"
        : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay";

    const checkoutOrderStatusBaseUrl =
      env === "PROD"
        ? "https://api.phonepe.com/apis/pg/checkout/v2/order"
        : "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order";

    return {
      clientId,
      clientSecret,
      clientVersion,
      env,
      oauthTokenUrl,
      checkoutPayUrl,
      checkoutOrderStatusBaseUrl,
    };
  }

  /** OAuth access token (alias for clarity). */
  async getAccessToken() {
    return this.getAuthorizationTokenV2();
  }

  async getAuthorizationTokenV2() {
    const { clientId, clientSecret, clientVersion, oauthTokenUrl } = this.getV2Config();

    const response = await fetch(oauthTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_version: clientVersion,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
      timeout: 30000,
    });

    const text = await response.text().catch(() => null);
    if (!response.ok) {
      throw new Error(
        `PhonePe v2 token request failed: ${response.status} ${response.statusText}. Body: ${
          text ? String(text).slice(0, 1000) : "no response body"
        }`
      );
    }

    const data = text ? JSON.parse(text) : await response.json();
    if (!data?.access_token) {
      throw new Error(`PhonePe v2 token response missing access_token: ${text ? String(text).slice(0, 500) : "empty response"}`);
    }
    return data.access_token;
  }

  async createPaymentRequestV2({ merchantTransactionId, amountPaisa, redirectUrl }) {
    const { checkoutPayUrl } = this.getV2Config();
    const accessToken = await this.getAccessToken();

    const payload = {
      merchantOrderId: merchantTransactionId,
      amount: amountPaisa,
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: { redirectUrl },
      },
    };

    const response = await fetch(checkoutPayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      timeout: 30000,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => null);
      throw new Error(
        `PhonePe v2 create payment failed: ${response.status} ${response.statusText}. Body: ${
          errText ? String(errText).slice(0, 1000) : "no response body"
        }`
      );
    }

    const result = await response.json();
    const redirect = result?.redirectUrl;
    if (!redirect) {
      throw new Error(`PhonePe v2 create payment returned no redirectUrl: ${JSON.stringify(result).slice(0, 500)}`);
    }

    return { redirectUrl: redirect, phonePeOrderId: result?.orderId };
  }

  /**
   * GET order status by merchant order id (source of truth).
   */
  async checkPaymentStatus(merchantOrderId, options = {}) {
    if (!this.isV2Enabled()) {
      throw new Error("checkPaymentStatus requires PhonePe V2 (OAuth) configuration.");
    }
    if (!merchantOrderId || typeof merchantOrderId !== "string") {
      throw new Error("merchantOrderId is required");
    }

    const details = options.details === true ? "true" : "false";
    const { checkoutOrderStatusBaseUrl } = this.getV2Config();
    const accessToken = await this.getAccessToken();
    const encodedId = encodeURIComponent(merchantOrderId);
    const url = `${checkoutOrderStatusBaseUrl}/${encodedId}/status?details=${details}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `O-Bearer ${accessToken}`,
      },
      timeout: 30000,
    });

    const text = await response.text().catch(() => null);
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      const err = new Error(`PhonePe order status: invalid JSON (${response.status})`);
      err.statusCode = response.status;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(
        `PhonePe order status failed: ${response.status} ${response.statusText}. Body: ${
          text ? String(text).slice(0, 800) : "empty"
        }`
      );
      err.statusCode = response.status;
      err.phonePePayload = data;
      throw err;
    }

    if (data && data.success === false) {
      const err = new Error(data.message || data.code || "PHONEPE_ORDER_STATUS_FAILED");
      err.code = data.code;
      err.phonePePayload = data;
      throw err;
    }

    return data;
  }

  async createPaymentRequest({ merchantTransactionId, amountPaisa, redirectUrl }) {
    if (!this.isV2Enabled()) {
      throw new Error("PhonePe V2 is not configured.");
    }
    return this.createPaymentRequestV2({ merchantTransactionId, amountPaisa, redirectUrl });
  }
}

module.exports = new PhonePeService();
