export type OrderStatus =
  | "Pending"
  | "Shipped"
  | "Completed"
  | "Cancel"
  | "Incompleted";

/** Product lifecycle labels (Admin). Backend: published/draft/inactive/archived/trash. */
export type ProductStatus = "Published" | "Draft" | "Inactive" | "Archived" | "Trash";

/** Brand / category / coupon on-off — not product lifecycle. */
export type EntityStatus = "Active" | "Inactive";

export type MediaType = "image" | "video";

export interface AdminMediaAsset {
  id: string;
  url: string;
  mediaType: MediaType;
  displayName: string;
  altText: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  isShared: boolean;
  createdAt: string;
}

export interface AdminProductFeature {
  key: string;
  value: string;
  code?: string;
  values?: string[];
}

export interface AdminProductVariantAxis {
  type: string;
  values: string[];
}

export interface AdminProductQanda {
  question: string;
  answer: string;
}

/** Optional legacy care rows → backend usageInstructions[{ title, instruction }]. */
export interface AdminProductUsageInstruction {
  title: string;
  instruction: string;
}

/** Maps to product.manufacturerConditions (and flat form aliases on write). */
export interface AdminManufacturerConditions {
  summary?: string;
  details?: string;
  countryOfOrigin?: string;
  marketedBy?: string;
  grievanceRedressal?: string;
}

export interface AdminBrand {
  id: string;
  name: string;
  logo: string;
  description: string;
  status: EntityStatus;
}

export interface AdminProduct {
  id: string;
  name: string;
  sku: string;
  /** Effective selling price for listing cards (sale when on sale, else regular). */
  price: number;
  /**
   * Backend `regularPrice` (MRP / list). Always round-trip into the List Price field —
   * do not derive this from storefront compare-at display rules.
   */
  regularPrice: number;
  /**
   * Backend `salePrice`. `0` means unset. Round-trip into the Sale Price field.
   */
  salePrice: number;
  /** Set when on sale (sale &lt; regular) for strikethrough-style display. */
  compareAtPrice?: number;
  stock: number;
  status: ProductStatus;
  categoryId: string;
  subcategoryId?: string;
  childCategoryId?: string;
  /** Optional brand ObjectId (populated name in brandName). */
  brandId?: string;
  brandName?: string;
  image: string;
  imageAlt: string;
  mainImageId?: string;
  galleryImages: string[];
  galleryImageIds: string[];
  video?: string;
  videoId?: string;
  shortDescription: string;
  description: string;
  /** Physical dimensions (product length / width / height). */
  length?: number;
  width?: number;
  height?: number;
  /** Net weight (product.weight). */
  weight?: number;
  featuresContent: string;
  usageSafetyContent: string;
  usageInstructions?: AdminProductUsageInstruction[];
  manufacturerConditions?: AdminManufacturerConditions;
  features: AdminProductFeature[];
  qandas?: AdminProductQanda[];
  variantAxes: AdminProductVariantAxis[];
  variantPricing: Record<string, { price?: number; salePrice?: number }>;
  variantStock: Record<string, number>;
  variantSku: Record<string, string>;
  variantMedia: Record<
    string,
    { mainImage?: string; galleryImages?: string[]; video?: string }
  >;
  variants: Array<{
    id: string;
    title: string;
    sku: string;
    stock: number;
    price: number;
  }>;
  /** Product-level SEO → backend metaTitle. */
  seoTitle: string;
  /** Product-level SEO → backend metaDescription. */
  seoDescription: string;
  metaKeywords?: string;
  /** Flat primaryKeyword; backend maps into seo.primaryKeyword on autosave. */
  primaryKeyword?: string;
  weightClassId?: string;
  /** Product GST %; 0 means use category hierarchy fallback in gstEngineService. */
  taxRate: number;
  taxIncluded: boolean;
  hsnCode: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  status: EntityStatus;
  image: string;
  title?: string;
  description?: string;
  taxRate?: number;
  /** Category tax type — GST | VAT | NONE. */
  taxType?: string;
}

export type TaxonomyTaxType = "GST" | "VAT" | "NONE";

export interface AdminCategoryHierarchyRow {
  catId: string;
  category: string;
  categorySlug?: string;
  categoryImage: string;
  status: EntityStatus;
  /** Category-level tax rate (%). */
  categoryTaxRate?: number;
  categoryTaxType?: TaxonomyTaxType;
  subId?: string;
  subcategory: string;
  subcategorySlug?: string;
  subcategoryImage?: string;
  /**
   * Subcategory tax rate (%).
   * `null` / omitted = inherit from category; `0` = explicit 0%.
   */
  subcategoryTaxRate?: number | null;
  subcategoryTaxType?: TaxonomyTaxType;
  childId?: string;
  child: string;
  childSlug?: string;
  childImage?: string;
  /**
   * Child tax rate (%).
   * `null` / omitted = inherit from parent; `0` = explicit 0%.
   */
  childTaxRate?: number | null;
  childTaxType?: TaxonomyTaxType;
}

export interface AdminCategoryHierarchyResult {
  rows: AdminCategoryHierarchyRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface OrderLine {
  productId: string;
  name: string;
  sku: string;
  image: string;
  quantity: number;
  unitPrice: number;
}

export interface AdminOrderPricing {
  subtotal: number;
  subtotalLabel: string;
  couponCode: string | null;
  couponDiscount: number;
  bulkDiscount: number;
  discountAmount: number;
  shippingCharge: number;
  taxAmount: number;
  total: number;
}

export interface AdminOrder {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  date: string;
  status: OrderStatus;
  payment: string;
  shipping: {
    name: string;
    address: string;
    city: string;
    pincode: string;
    phone: string;
  };
  lines: OrderLine[];
  /** Server-persisted financial snapshot fields for display only. */
  pricing?: AdminOrderPricing | null;
  /** Backend fulfilment status used for writes. Not shown as a Seller field. */
  backendStatus?: string;
  paymentStatus?: string;
  fulfilmentKind?: string;
  sourceOrderId?: string | null;
  afterSales?: {
    status?: string | null;
    resolution?: string | null;
    replacementOrderId?: string | null;
    returnRequestId?: string | null;
  } | null;
  shipments?: Array<{
    status?: string | null;
    trackingNumber?: string | null;
    shiprocketOrderId?: string | null;
    shiprocketShipmentId?: string | null;
    shiprocketLabelUrl?: string | null;
  }>;
  trackingNumber?: string | null;
  shiprocketLabelUrl?: string | null;
}

export interface AdminCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
  joinedAt: string;
  city: string;
}

export interface AdminCoupon {
  id: string;
  code: string;
  discount: string;
  status: EntityStatus;
  expiry: string;
  description: string;
}

export interface AdminBanner {
  id: string;
  title: string;
  status: EntityStatus;
  image: string;
  mobileImage?: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface CmsContent {
  heading: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  image: string;
}

export interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  socialImage: string;
}

export interface StoreSettings {
  storeName: string;
  email: string;
  phone: string;
  whatsapp: string;
  currency: string;
  shippingThreshold: number;
}
