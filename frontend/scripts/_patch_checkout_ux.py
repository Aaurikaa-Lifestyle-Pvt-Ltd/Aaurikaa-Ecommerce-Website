from pathlib import Path

path = Path("frontend/src/components/checkout/checkout-view.tsx")
text = path.read_text(encoding="utf-8")

# --- submit payload: use form stateId/countryId ---
old_submit = """        country: selected?.countryName || \"India\",
        stateId: selected?.stateId,
        countryId: selected?.countryId,
      },
      coupon,
      paymentMethod: values.paymentMethod === \"phonepe\" ? \"phonepe\" : \"cod\","""
new_submit = """        country: values.shipping.countryName || selected?.countryName || \"India\",
        stateId: values.shipping.stateId || selected?.stateId,
        countryId: values.shipping.countryId || selected?.countryId,
      },
      coupon,
      paymentMethod: values.paymentMethod === \"phonepe\" ? \"phonepe\" : \"cod\","""
if old_submit not in text:
    raise SystemExit("submit block missing")
text = text.replace(old_submit, new_submit, 1)

# --- helpers after selectSavedAddress ---
old_select = """  function selectSavedAddress(id: string) {
    setSelectedAddressId(id);
    const address = addresses.find((item) => item.id === id);
    if (!address) return;
    setValues((prev) => ({
      ...prev,
      shipping: addressToForm(address, prev.customer),
    }));
  }"""
new_select = """  function selectSavedAddress(id: string) {
    setSelectedAddressId(id);
    const address = addresses.find((item) => item.id === id);
    if (!address) return;
    setValues((prev) => ({
      ...prev,
      shipping: addressToForm(address, prev.customer),
    }));
    toast.success(\"Delivery address selected\");
  }

  function startNewAddress() {
    setSelectedAddressId(\"new\");
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
        state: \"\",
        stateId: \"\",
      },
    }));
    clearFieldError(\"shipping.country\");
    clearFieldError(\"shipping.state\");
  }

  function selectState(stateId: string) {
    const option = states.find((item) => item.id === stateId);
    setValues((prev) => ({
      ...prev,
      shipping: {
        ...prev.shipping,
        stateId,
        state: option?.name || \"\",
      },
    }));
    clearFieldError(\"shipping.state\");
  }"""
if old_select not in text:
    raise SystemExit("selectSavedAddress missing")
text = text.replace(old_select, new_select, 1)

# radio new address
text = text.replace(
    'onChange={() => setSelectedAddressId("new")}',
    "onChange={startNewAddress}",
    1,
)
for old_label in (
    ">Use a different address</span>",
    ">Use a different address</span>",
    ">Use a different address</span>",
):
    if old_label in text:
        text = text.replace(old_label, ">Add new address</span>", 1)
        break

# Replace shipping fields grid
start = text.find('<div className="mt-5 grid gap-4 sm:grid-cols-2">\n                <Field\n                  id="shipping-name"')
if start < 0:
    raise SystemExit("shipping grid start missing")
# find matching close after pin field
pin = text.find('id="shipping-pin"', start)
end = text.find("</div>", text.find("</Field>", pin)) + len("</div>")

new_block = r'''{addressesLoading ? (
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
                <Field
                  id="shipping-address"
                  label="Address"
                  error={errors["shipping.address"]}
                  className="sm:col-span-2"
                >
                  <TextTextarea
                    id="shipping-address"
                    rows={3}
                    placeholder="House / flat, street, landmark"
                    autoComplete="shipping street-address"
                    value={values.shipping.address}
                    error={Boolean(errors["shipping.address"])}
                    onChange={(e) => updateShipping("address", e.target.value)}
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
                <Field id="shipping-city" label="City" error={errors["shipping.city"]}>
                  <TextInput
                    id="shipping-city"
                    autoComplete="shipping address-level2"
                    value={values.shipping.city}
                    error={Boolean(errors["shipping.city"])}
                    onChange={(e) => updateShipping("city", e.target.value)}
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
                {geoLoading || statesLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                    <Spinner /> Updating location options…
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Used for this order. Saving to your address book still requires a district on the{" "}
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
                  <p className="mt-1 text-muted-foreground">{values.shipping.address}</p>
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
              )}'''

text = text[:start] + new_block + text[end:]

old_cta = """                ) : values.paymentMethod === \"phonepe\" ? (
                  \"Pay with PhonePe\"
                ) : (
                  \"Place Order\"
                )}"""
new_cta = """                ) : (
                  placeOrderCtaLabel(values.paymentMethod, quote?.total)
                )}"""
if old_cta in text:
    text = text.replace(old_cta, new_cta, 1)
    print("cta ok")
else:
    print("cta missing")

# Ensure blankShipping exists (earlier named blankShipping)
if "function blankShipping" not in text and "function blankShipping" in text:
    pass
if "blankShipping(" in text and "function blankShipping" not in text:
    # rename calls if function is blankShipping
    if "function blankShipping" in text:
        text = text.replace("blankShipping(", "blankShipping(")

path.write_text(text, encoding="utf-8")
print("ok lines", len(text.splitlines()))
print("has startNewAddress", "function startNewAddress" in text)
print("has selectCountry", "function selectCountry" in text)
print("has SelectInput country", 'id="shipping-country"' in text)
print("submit uses values.shipping.stateId", "values.shipping.stateId || selected?.stateId" in text)
