"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useCart } from "@/components/cart";
import { useShopperAuth } from "@/lib/auth/shopper-provider";
import { ShopperAuthPanel } from "@/components/account/shopper-auth-panel";
import {
  ORDER_STORAGE_KEY,
  paymentOptions,
  type PaymentMethodId,
} from "@/config/checkout";
import {
  emptyCheckoutForm,
  placeOrderCtaLabel,
  validateCheckoutForm,
  type CheckoutFieldErrors,
  type CheckoutFormValues,
} from "@/lib/checkout";
import { readCheckoutCoupon, writeCheckoutCoupon } from "@/lib/coupon";
import { clearBuyNowIntent, readBuyNowIntent, type BuyNowLine } from "@/lib/buy-now";
import {
  createShopperAddress,
  fetchCountries,
  fetchDistricts,
  fetchShopperAddresses,
  fetchStates,
  type GeoOption,
  type ShopperAddress,
} from "@/lib/api/addresses";
import { createShopperOrder } from "@/lib/api/orders";
import { fetchCheckoutQuote, type PricingQuote } from "@/lib/api/pricing";
import { initiatePhonePePayment } from "@/lib/api/payments";
import { buildCreateOrderPayload } from "@/lib/mappers/order-payload";
import { formatCommerceApiError } from "@/lib/commerce-errors";
import { isApiConfigured } from "@/lib/api/config";
import { cn } from "@/lib/cn";
import { Field, SelectInput, TextInput } from "./checkout-field";
import { CheckoutSummary } from "./checkout-summary";
import type { CartItem } from "@/types/cart";

function lineToCartItem(line: BuyNowLine): CartItem {
  return {
    id: `${line.productId}::${line.variantKey || "default"}`,
    productId: line.productId,
    slug: line.slug,
    name: line.name,
    image: line.image,
    quantity: line.quantity,
    price: { amount: 0, currency: "INR" },
    variantId: line.variantKey,
    variantTitle: line.variantTitle,
    options: line.options,
  };
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function addressToForm(
  address: ShopperAddress,
  customer: CheckoutFormValues["customer"],
): CheckoutFormValues["shipping"] {
  return {
    fullName: address.contactName || customer.fullName,
    addressLine1: address.addressLine1 || "",
    addressLine2: address.addressLine2 || "",
    landmark: address.landmark || "",
    city: address.city,
    state: address.stateName || "",
    stateId: address.stateId || "",
    districtId: address.districtId || "",
    countryName: address.countryName || "India",
    countryId: address.countryId || "",
    pinCode: address.pincode,
    phone: address.contactPhone || customer.phone,
  };
}

function blankShipping(
  customer: CheckoutFormValues["customer"],
  country?: GeoOption | null,
): CheckoutFormValues["shipping"] {
  return {
    fullName: customer.fullName,
    addressLine1: "",
    addressLine2: "",
    landmark: "",
    city: "",
    state: "",
    stateId: "",
    districtId: "",
    countryName: country?.name || "India",
    countryId: country?.id || "",
    pinCode: "",
    phone: customer.phone,
  };
}

function formatShippingPreview(shipping: CheckoutFormValues["shipping"]): string[] {
  return [
    shipping.addressLine1,
    shipping.addressLine2,
    shipping.landmark,
  ].filter((part): part is string => Boolean(part?.trim()));
}

function pickIndia(countries: GeoOption[]): GeoOption | undefined {
  return (
    countries.find((item) => item.name.trim().toLowerCase() === "india") ??
    countries[0]
  );
}


/**
 * Authenticated checkout against POST /api/orders (COD).
 * Buy Now uses a session intent and does not require the cart page.
 */
export function CheckoutView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const buyNow = searchParams.get("source") === "buy-now";
  const { items, ready: cartReady, clearCart } = useCart();
  const { user, ready: authReady, configured } = useShopperAuth();
  const toast = useToast();
  const [intentLine, setIntentLine] = useState<BuyNowLine | null>(null);
  const [intentReady, setIntentReady] = useState(!buyNow);
  const [values, setValues] = useState<CheckoutFormValues>(emptyCheckoutForm);
  const [errors, setErrors] = useState<CheckoutFieldErrors>({});
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<ShopperAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | "new">("new");
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<PricingQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [countries, setCountries] = useState<GeoOption[]>([]);
  const [states, setStates] = useState<GeoOption[]>([]);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [statesLoading, setStatesLoading] = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [addressesLoading, setAddressesLoading] = useState(false);
  const [saveAddressToAccount, setSaveAddressToAccount] = useState(false);
  const indiaRef = useRef<GeoOption | null>(null);

  useEffect(() => {
    setCoupon(readCheckoutCoupon());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setGeoLoading(true);
    fetchCountries()
      .then((list) => {
        if (cancelled) return;
        setCountries(list);
        const india = pickIndia(list);
        if (india) {
          indiaRef.current = india;
          setValues((prev) => {
            if (prev.shipping.countryId) return prev;
            return {
              ...prev,
              shipping: {
                ...prev.shipping,
                countryId: india.id,
                countryName: india.name,
              },
            };
          });
        }
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      })
      .finally(() => {
        if (!cancelled) setGeoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const countryId = values.shipping.countryId;
    if (!countryId) {
      setStates([]);
      return;
    }
    let cancelled = false;
    setStatesLoading(true);
    fetchStates(countryId)
      .then((list) => {
        if (!cancelled) setStates(list);
      })
      .catch(() => {
        if (!cancelled) setStates([]);
      })
      .finally(() => {
        if (!cancelled) setStatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [values.shipping.countryId]);

  useEffect(() => {
    const stateId = values.shipping.stateId;
    if (!stateId) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    setDistrictsLoading(true);
    fetchDistricts(stateId)
      .then((list) => {
        if (!cancelled) setDistricts(list);
      })
      .catch(() => {
        if (!cancelled) setDistricts([]);
      })
      .finally(() => {
        if (!cancelled) setDistrictsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [values.shipping.stateId]);

  useEffect(() => {
    if (!buyNow) return;
    const intent = readBuyNowIntent();
    setIntentLine(intent?.line ?? null);
    setIntentReady(true);
  }, [buyNow]);

  useEffect(() => {
    if (!user) return;
    const profileName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
    setValues((prev) => ({
      ...prev,
      customer: {
        fullName: profileName || prev.customer.fullName,
        email: user.email || prev.customer.email,
        phone: user.phone || prev.customer.phone,
      },
      shipping: {
        ...prev.shipping,
        fullName: prev.shipping.fullName || profileName,
        phone: prev.shipping.phone || user.phone || prev.customer.phone,
      },
      paymentMethod: "phonepe",
    }));
    setAddressesLoading(true);
    fetchShopperAddresses()
      .then((list) => {
        setAddresses(list);
        const def = list.find((item) => item.isDefault) ?? list[0];
        if (def) {
          // Legacy saved rows without district must open the form to complete locality.
          setSelectedAddressId(def.districtId ? def.id : "new");
          setValues((prev) => ({
            ...prev,
            shipping: addressToForm(def, {
              fullName: profileName || prev.customer.fullName,
              email: user.email || prev.customer.email,
              phone: user.phone || prev.customer.phone,
            }),
          }));
        }
      })
      .catch(() => {
        setAddresses([]);
      })
      .finally(() => {
        setAddressesLoading(false);
      });
  }, [user]);

  const checkoutItems = useMemo(() => {
    if (buyNow && intentLine) return [lineToCartItem(intentLine)];
    return items;
  }, [buyNow, intentLine, items]);

  /** Stable across Place Order retries (e.g. PhonePe initiate fail); reset when lines/source change. */
  const idempotencyKeyRef = useRef<string | null>(null);
  const attemptFingerprintRef = useRef<string>("");
  const attemptFingerprint = useMemo(() => {
    const lines = checkoutItems
      .map((item) => `${item.productId}:${item.variantId || ""}:${item.quantity}`)
      .join("|");
    const pay = values.paymentMethod === "phonepe" ? "phonepe" : "cod";
    return `${buyNow ? "buy-now" : "cart"}::${pay}::${lines}`;
  }, [buyNow, checkoutItems, values.paymentMethod]);

  useEffect(() => {
    if (attemptFingerprintRef.current === attemptFingerprint) return;
    attemptFingerprintRef.current = attemptFingerprint;
    idempotencyKeyRef.current = null;
  }, [attemptFingerprint]);

  useEffect(() => {
    if (!user || checkoutItems.length === 0) {
      setQuote(null);
      return;
    }

    const hasShipDest =
      Boolean(values.shipping.state.trim()) &&
      /^\d{6}$/.test(values.shipping.pinCode.trim());

    const selected =
      selectedAddressId !== "new"
        ? addresses.find((item) => item.id === selectedAddressId)
        : undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setQuoting(true);
      fetchCheckoutQuote({
        items: checkoutItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          variantKey: item.variantId,
          options: item.options,
        })),
        coupon,
        ...(hasShipDest
          ? {
              shipping: {
                name: values.shipping.fullName,
                email: values.customer.email,
                phone: values.shipping.phone,
                address1: values.shipping.addressLine1,
                address2: values.shipping.addressLine2?.trim() || undefined,
                city: values.shipping.city,
                state: values.shipping.state,
                zip: values.shipping.pinCode,
                country: values.shipping.countryName || selected?.countryName || "India",
                stateId: values.shipping.stateId || selected?.stateId,
                countryId: values.shipping.countryId || selected?.countryId,
              },
            }
          : {}),
      })
        .then((next) => {
          if (cancelled) return;
          setQuote(next);
          setQuoteError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setQuote(null);
          const message = formatCommerceApiError(
            err,
            "Unable to calculate shipping and GST yet.",
          );
          setQuoteError(message);
          toast.error("Quote unavailable", message);
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    user,
    checkoutItems,
    coupon,
    selectedAddressId,
    addresses,
    values.shipping.fullName,
    values.shipping.phone,
    values.shipping.addressLine1,
    values.shipping.addressLine2,
    values.shipping.city,
    values.shipping.state,
    values.shipping.stateId,
    values.shipping.countryId,
    values.shipping.countryName,
    values.shipping.pinCode,
    values.customer.email,
    toast,
  ]);

  const ready = cartReady && authReady && intentReady;

  function clearFieldError(key: keyof CheckoutFieldErrors) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  function updateCustomer<K extends keyof CheckoutFormValues["customer"]>(
    key: K,
    value: CheckoutFormValues["customer"][K],
  ) {
    setValues((prev) => ({
      ...prev,
      customer: { ...prev.customer, [key]: value },
    }));
    clearFieldError(`customer.${String(key)}` as keyof CheckoutFieldErrors);
  }

  function updateShipping<K extends keyof CheckoutFormValues["shipping"]>(
    key: K,
    value: CheckoutFormValues["shipping"][K],
  ) {
    setValues((prev) => ({
      ...prev,
      shipping: { ...prev.shipping, [key]: value },
    }));
    clearFieldError(`shipping.${String(key)}` as keyof CheckoutFieldErrors);
  }

  function selectSavedAddress(id: string) {
    const address = addresses.find((item) => item.id === id);
    if (!address) return;
    setSaveAddressToAccount(false);
    setValues((prev) => ({
      ...prev,
      shipping: addressToForm(address, prev.customer),
    }));
    if (!address.districtId) {
      setSelectedAddressId("new");
      toast.success("Select a district to finish this address");
      return;
    }
    setSelectedAddressId(id);
    toast.success("Delivery address selected");
  }

  function startNewAddress() {
    setSelectedAddressId("new");
    setSaveAddressToAccount(false);
    setValues((prev) => ({
      ...prev,
      shipping: blankShipping(prev.customer, indiaRef.current),
    }));
  }

  function selectCountry(countryId: string) {
    const option = countries.find((item) => item.id === countryId);
    setValues((prev) => ({
      ...prev,
      shipping: {
        ...prev.shipping,
        countryId,
        countryName: option?.name || prev.shipping.countryName,
        state: "",
        stateId: "",
        districtId: "",
      },
    }));
    clearFieldError("shipping.country");
    clearFieldError("shipping.state");
    clearFieldError("shipping.district");
  }

  function selectState(stateId: string) {
    const option = states.find((item) => item.id === stateId);
    setValues((prev) => ({
      ...prev,
      shipping: {
        ...prev.shipping,
        stateId,
        state: option?.name || "",
        districtId: "",
      },
    }));
    clearFieldError("shipping.state");
    clearFieldError("shipping.district");
  }

  function selectDistrict(districtId: string) {
    setValues((prev) => ({
      ...prev,
      shipping: {
        ...prev.shipping,
        districtId,
      },
    }));
    clearFieldError("shipping.district");
  }

  async function maybeSaveAddressToAccount(): Promise<void> {
    if (!saveAddressToAccount || selectedAddressId !== "new") return;

    const countryId = values.shipping.countryId?.trim();
    const stateId = values.shipping.stateId?.trim();
    const districtId = values.shipping.districtId?.trim();
    if (!countryId || !stateId || !districtId) {
      toast.error(
        "Address not saved",
        "Country, state, and district are required to save an address.",
      );
      return;
    }

    try {
      const body = {
        type: "home" as const,
        addressLine1: values.shipping.addressLine1.trim(),
        city: values.shipping.city.trim(),
        pincode: values.shipping.pinCode.trim(),
        contactName: values.shipping.fullName.trim(),
        contactPhone: phoneDigits(values.shipping.phone),
        contactEmail: values.customer.email.trim() || undefined,
        country: countryId,
        state: stateId,
        district: districtId,
      };
      const line2 = values.shipping.addressLine2?.trim();
      const landmark = values.shipping.landmark?.trim();
      await createShopperAddress({
        ...body,
        ...(line2 ? { addressLine2: line2 } : {}),
        ...(landmark ? { landmark } : {}),
      });
      toast.success("Address saved to your account");
      const list = await fetchShopperAddresses();
      setAddresses(list);
    } catch (err: unknown) {
      toast.error(
        "Address not saved",
        formatCommerceApiError(err, "Unable to save this address to your account."),
      );
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (checkoutItems.length === 0) {
      setFormError("Add a product before checking out.");
      return;
    }

    const requireDistrict =
      selectedAddressId === "new"
        ? !districtsLoading && districts.length > 0
        : false;
    const nextErrors = validateCheckoutForm(values, { requireDistrict });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError("Please fix the highlighted fields to continue.");
      return;
    }

    const selected =
      selectedAddressId !== "new"
        ? addresses.find((item) => item.id === selectedAddressId)
        : undefined;

    const address2 = values.shipping.addressLine2?.trim();
    const payload = buildCreateOrderPayload({
      items: checkoutItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        variantKey: item.variantId,
        options: item.options,
      })),
      shipping: {
        name: values.shipping.fullName,
        email: values.customer.email,
        phone: values.shipping.phone,
        address1: values.shipping.addressLine1,
        ...(address2 ? { address2 } : {}),
        city: values.shipping.city,
        state: values.shipping.state,
        zip: values.shipping.pinCode,
        country: values.shipping.countryName || selected?.countryName || "India",
        stateId: values.shipping.stateId || selected?.stateId,
        countryId: values.shipping.countryId || selected?.countryId,
      },
      coupon,
      paymentMethod: values.paymentMethod === "phonepe" ? "phonepe" : "cod",
      clientTotal: 1,
      clientLinePrice: 1,
      sellerId: "should-not-be-sent",
    });

    setProcessing(true);
    try {
      await maybeSaveAddressToAccount();

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      }
      const created = await createShopperOrder(payload, idempotencyKeyRef.current);
      try {
        sessionStorage.setItem(
          ORDER_STORAGE_KEY,
          JSON.stringify({
            orderNumber: created.invoiceNumber,
            orderId: created.id,
            totalAmount: created.totalAmount,
            status: created.status,
            paymentStatus: created.paymentStatus,
            demo: false,
          }),
        );
      } catch {
        // Confirmation can still use the query string.
      }

      if (payload.paymentMethod === "phonepe") {
        try {
          const initiated = await initiatePhonePePayment(created.id);
          if (buyNow) clearBuyNowIntent();
          else clearCart();
          toast.info("Redirecting to PhonePe");
          window.location.assign(initiated.redirectUrl);
          return;
        } catch (err: unknown) {
          const message = formatCommerceApiError(
            err,
            "PhonePe is not available. The order was created as unpaid; use Cash on Delivery or try again after PhonePe is configured.",
          );
          setFormError(message);
          toast.error("PhonePe unavailable", message);
          setProcessing(false);
          return;
        }
      }

      if (buyNow) {
        clearBuyNowIntent();
      } else {
        clearCart();
      }
      toast.success("Order placed");
      router.push(
        `/order-confirmation?order=${encodeURIComponent(created.invoiceNumber)}&id=${encodeURIComponent(created.id)}`,
      );
    } catch (err: unknown) {
      const message = formatCommerceApiError(
        err,
        "Unable to place this order. Please try again.",
      );
      setFormError(message);
      toast.error("Order failed", message);
      setProcessing(false);
    }
  }

  if (!ready) {
    return (
      <div className="py-16 sm:py-20">
        <Container>
          <p className="text-sm text-muted-foreground">Loading checkout…</p>
        </Container>
      </div>
    );
  }

  if (!configured || !isApiConfigured()) {
    return (
      <div className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto max-w-lg text-center">
            <p className="eyebrow mb-4">Checkout</p>
            <h1 className="font-serif text-3xl tracking-tight">Checkout unavailable</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Set NEXT_PUBLIC_API_BASE_URL to place orders against the shopper APIs.
            </p>
          </div>
        </Container>
      </div>
    );
  }

  if (checkoutItems.length === 0 && !processing) {
    return (
      <div className="py-20 sm:py-28">
        <Container>
          <div className="mx-auto max-w-lg text-center">
            <p className="eyebrow mb-4">Checkout</p>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              {buyNow ? "This Buy Now session expired" : "Your bag is empty"}
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {buyNow
                ? "Return to the product and choose Buy Now again."
                : "Add pieces to your bag before continuing to checkout."}
            </p>
            <div className="mt-8">
              <ButtonLink href="/collections/new-arrivals" variant="primary" size="md">
                Continue Shopping
              </ButtonLink>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
        <Container>
          <header className="mb-8 sm:mb-10">
            <p className="eyebrow mb-3">{buyNow ? "Buy Now" : "Checkout"}</p>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Identify yourself
            </h1>
          </header>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ShopperAuthPanel title="Continue to checkout" />
            <CheckoutSummary
              items={checkoutItems}
              quote={quote}
              quoteError={quoteError}
              quoting={quoting}
              couponCode={coupon}
              onApplyCoupon={(code) => {
                setCoupon(code);
                writeCheckoutCoupon(code);
              }}
              onRemoveCoupon={() => {
                setCoupon("");
                writeCheckoutCoupon("");
              }}
            />
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="pb-16 pt-8 sm:pb-20 sm:pt-10">
      <Container>
        <header className="mb-8 sm:mb-10">
          <p className="eyebrow mb-3">{buyNow ? "Buy Now checkout" : "Secure checkout"}</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">Checkout</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Pay securely with PhonePe. Prices, GST, shipping, coupons, and the
            payable total are calculated by the backend.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14 xl:grid-cols-[minmax(0,1fr)_400px]"
        >
          <div className="flex flex-col gap-10">
            <section aria-labelledby="checkout-customer">
              <h2 id="checkout-customer" className="font-serif text-2xl tracking-tight">
                Customer information
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  id="customer-name"
                  label="Full name"
                  error={errors["customer.fullName"]}
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="customer-name"
                    value={values.customer.fullName}
                    error={Boolean(errors["customer.fullName"])}
                    onChange={(e) => updateCustomer("fullName", e.target.value)}
                  />
                </Field>
                <Field id="customer-email" label="Email" error={errors["customer.email"]}>
                  <TextInput
                    id="customer-email"
                    type="email"
                    value={values.customer.email}
                    error={Boolean(errors["customer.email"])}
                    onChange={(e) => updateCustomer("email", e.target.value)}
                  />
                </Field>
                <Field id="customer-phone" label="Phone" error={errors["customer.phone"]}>
                  <TextInput
                    id="customer-phone"
                    type="tel"
                    value={values.customer.phone}
                    error={Boolean(errors["customer.phone"])}
                    onChange={(e) => updateCustomer("phone", e.target.value)}
                  />
                </Field>
              </div>
            </section>

            <section aria-labelledby="checkout-shipping">
              <h2 id="checkout-shipping" className="font-serif text-2xl tracking-tight">
                Delivery address
              </h2>
              {addresses.length > 0 ? (
                <fieldset className="mt-5 space-y-3">
                  <legend className="sr-only">Saved addresses</legend>
                  {addresses.map((address) => {
                    const selected = selectedAddressId === address.id;
                    return (
                      <label
                        key={address.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3",
                          selected
                            ? "border-foreground bg-muted/40"
                            : "border-border bg-surface hover:border-foreground/40",
                        )}
                      >
                        <input
                          type="radio"
                          name="savedAddress"
                          checked={selected}
                          onChange={() => selectSavedAddress(address.id)}
                          className="mt-1 accent-primary"
                        />
                        <span className="text-sm">
                          <span className="font-medium">
                            {address.contactName}
                            {address.isDefault ? " · Default" : ""}
                          </span>
                          <span className="mt-1 block text-muted-foreground">
                            {address.addressLine1}, {address.city} {address.pincode}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3",
                      selectedAddressId === "new"
                        ? "border-foreground bg-muted/40"
                        : "border-border bg-surface",
                    )}
                  >
                    <input
                      type="radio"
                      name="savedAddress"
                      checked={selectedAddressId === "new"}
                      onChange={startNewAddress}
                      className="mt-1 accent-primary"
                    />
                    <span className="text-sm font-medium">Add new address</span>
                  </label>
                </fieldset>
              ) : null}

              {addressesLoading ? (
                <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner /> Loading saved addresses…
                </p>
              ) : null}

              {addresses.length === 0 || selectedAddressId === "new" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  id="shipping-name"
                  label="Full name"
                  error={errors["shipping.fullName"]}
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="shipping-name"
                    autoComplete="shipping name"
                    value={values.shipping.fullName}
                    error={Boolean(errors["shipping.fullName"])}
                    onChange={(e) => updateShipping("fullName", e.target.value)}
                  />
                </Field>
                <Field
                  id="shipping-phone"
                  label="Phone"
                  error={errors["shipping.phone"]}
                  hint="Prefills from your account when available."
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="shipping-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="shipping tel"
                    value={values.shipping.phone}
                    error={Boolean(errors["shipping.phone"])}
                    onChange={(e) => updateShipping("phone", e.target.value)}
                  />
                </Field>
                <Field id="shipping-country" label="Country" error={errors["shipping.country"]}>
                  <SelectInput
                    id="shipping-country"
                    value={values.shipping.countryId || ""}
                    error={Boolean(errors["shipping.country"])}
                    disabled={geoLoading || countries.length === 0}
                    onChange={(e) => selectCountry(e.target.value)}
                  >
                    <option value="">{geoLoading ? "Loading…" : "Select country"}</option>
                    {countries.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field id="shipping-state" label="State" error={errors["shipping.state"]}>
                  <SelectInput
                    id="shipping-state"
                    value={values.shipping.stateId || ""}
                    error={Boolean(errors["shipping.state"])}
                    disabled={!values.shipping.countryId || statesLoading || states.length === 0}
                    onChange={(e) => selectState(e.target.value)}
                  >
                    <option value="">
                      {!values.shipping.countryId
                        ? "Select country first"
                        : statesLoading
                          ? "Loading…"
                          : states.length === 0
                            ? "No states available"
                            : "Select state"}
                    </option>
                    {states.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field id="shipping-district" label="District" error={errors["shipping.district"]}>
                  <SelectInput
                    id="shipping-district"
                    value={values.shipping.districtId || ""}
                    error={Boolean(errors["shipping.district"])}
                    disabled={!values.shipping.stateId || districtsLoading || districts.length === 0}
                    onChange={(e) => selectDistrict(e.target.value)}
                  >
                    <option value="">
                      {!values.shipping.stateId
                        ? "Select state first"
                        : districtsLoading
                          ? "Loading…"
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
                <Field id="shipping-city" label="City / Town" error={errors["shipping.city"]}>
                  <TextInput
                    id="shipping-city"
                    autoComplete="shipping address-level2"
                    value={values.shipping.city}
                    error={Boolean(errors["shipping.city"])}
                    onChange={(e) => updateShipping("city", e.target.value)}
                  />
                </Field>
                <Field
                  id="shipping-address-line1"
                  label="Address line 1"
                  error={errors["shipping.addressLine1"]}
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="shipping-address-line1"
                    autoComplete="shipping address-line1"
                    maxLength={100}
                    placeholder="House / flat, street"
                    value={values.shipping.addressLine1}
                    error={Boolean(errors["shipping.addressLine1"])}
                    onChange={(e) => updateShipping("addressLine1", e.target.value)}
                  />
                </Field>
                <Field
                  id="shipping-address-line2"
                  label="Address line 2"
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="shipping-address-line2"
                    autoComplete="shipping address-line2"
                    maxLength={100}
                    placeholder="Apartment, suite, floor (optional)"
                    value={values.shipping.addressLine2 || ""}
                    onChange={(e) => updateShipping("addressLine2", e.target.value)}
                  />
                </Field>
                <Field id="shipping-landmark" label="Nearest landmark">
                  <TextInput
                    id="shipping-landmark"
                    maxLength={50}
                    placeholder="Optional"
                    value={values.shipping.landmark || ""}
                    onChange={(e) => updateShipping("landmark", e.target.value)}
                  />
                </Field>
                <Field id="shipping-pin" label="PIN code" error={errors["shipping.pinCode"]}>
                  <TextInput
                    id="shipping-pin"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="shipping postal-code"
                    value={values.shipping.pinCode}
                    error={Boolean(errors["shipping.pinCode"])}
                    onChange={(e) =>
                      updateShipping("pinCode", e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </Field>
                {geoLoading || statesLoading || districtsLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                    <Spinner /> Updating location options…
                  </p>
                ) : null}
                <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-1 accent-primary"
                    checked={saveAddressToAccount}
                    onChange={(e) => setSaveAddressToAccount(e.target.checked)}
                  />
                  <span className="text-sm">Save this address to my account</span>
                </label>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Used for this order. City / town is free text and is not filled from district.
                  Manage saved addresses on the{" "}
                  <Link href="/account/addresses" className="underline-offset-4 hover:underline">
                    account addresses
                  </Link>{" "}
                  page.
                </p>
              </div>
              ) : (
                <div
                  className="mt-5 rounded-control border border-border bg-muted/30 px-4 py-3 text-sm"
                  aria-live="polite"
                >
                  <p className="font-medium">{values.shipping.fullName}</p>
                  {formatShippingPreview(values.shipping).map((line, index) => (
                    <p key={`ship-line-${index}`} className="mt-1 text-muted-foreground">
                      {line}
                    </p>
                  ))}
                  <p className="text-muted-foreground">
                    {values.shipping.city}
                    {values.shipping.state ? `, ${values.shipping.state}` : ""}{" "}
                    {values.shipping.pinCode}
                  </p>
                  <p className="mt-1 text-muted-foreground">{values.shipping.phone}</p>
                  <button
                    type="button"
                    className="mt-3 text-xs font-medium underline-offset-4 hover:underline"
                    onClick={startNewAddress}
                  >
                    Add new address instead
                  </button>
                </div>
              )}
            </section>


            <section aria-labelledby="checkout-payment">
              <h2 id="checkout-payment" className="font-serif text-2xl tracking-tight">
                Payment
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                PhonePe requires backend credentials. If they are missing, initiate
                returns unavailable and the unpaid order is not marked paid.
              </p>
              <fieldset className="mt-5 space-y-3">
                {paymentOptions.map((option) => {
                  const selected = values.paymentMethod === option.id;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3",
                        selected
                          ? "border-foreground bg-muted/40"
                          : "border-border bg-surface hover:border-foreground/40",
                      )}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value={option.id}
                        checked={selected}
                        onChange={() =>
                          setValues((prev) => ({
                            ...prev,
                            paymentMethod: option.id as PaymentMethodId,
                          }))
                        }
                        className="mt-1 accent-primary"
                      />
                      <span>
                        <span className="block text-sm font-medium">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            </section>

            {formError ? (
              <p className="text-sm text-sale" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto sm:min-w-56"
                disabled={processing}
              >
                {processing ? (
                  <>
                    <Spinner />
                    {values.paymentMethod === "phonepe"
                      ? "Redirecting to PhonePe…"
                      : "Placing order…"}
                  </>
                ) : (
                  placeOrderCtaLabel(values.paymentMethod, quote?.total)
                )}
              </Button>
              {buyNow ? (
                <span className="text-sm text-muted-foreground">This order does not use your bag.</span>
              ) : (
                <Link
                  href="/cart"
                  className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:text-left"
                >
                  Return to bag
                </Link>
              )}
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              By placing your order you agree to our{" "}
              <Link
                href="/terms-condition"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Terms
              </Link>
              ,{" "}
              <Link
                href="/privacy-policy"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Privacy
              </Link>
              , and{" "}
              <Link
                href="/returns-refund-policy"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Returns
              </Link>{" "}
              policies.
            </p>
          </div>

          <CheckoutSummary
            items={checkoutItems}
            quote={quote}
            quoteError={quoteError}
            quoting={quoting}
            couponCode={coupon}
            onApplyCoupon={(code) => {
              setCoupon(code);
              writeCheckoutCoupon(code);
            }}
            onRemoveCoupon={() => {
              setCoupon("");
              writeCheckoutCoupon("");
            }}
            className="lg:sticky lg:top-28"
          />
        </form>
      </Container>
    </div>
  );
}
