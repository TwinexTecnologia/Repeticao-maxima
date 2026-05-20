export type NuvemshopCredentials = {
  storeId: string;
  accessToken: string;
  baseUrl: string;
  userAgent: string;
};

export type NuvemshopPromotion = {
  id: string;
  name?: string | null;
  active?: boolean | null;
  allocation_type?: string | null;
  combines_with_other_discounts?: boolean | null;
  combines_with_quantity_discounts?: boolean | null;
  combines_with_free_shipping?: boolean | null;
  combines_with_cart_amount_discounts?: boolean | null;
  combines_with_app_discounts?: boolean | null;
  combines_with_price_discounts?: boolean | null;
  [key: string]: unknown;
};

export type NuvemshopPromotionResponse =
  | NuvemshopPromotion
  | {
      data?: NuvemshopPromotion | null;
      [key: string]: unknown;
    };

export type NuvemshopPromotionInput = {
  name: string;
  active: boolean;
  allocation_type?: "line_items" | "cross_items";
  combines_with_other_discounts?: boolean;
  combines_with_quantity_discounts?: boolean;
  combines_with_free_shipping?: boolean;
  combines_with_cart_amount_discounts?: boolean;
  combines_with_app_discounts?: boolean;
  combines_with_price_discounts?: boolean;
};

export type NuvemshopLocalizedText =
  | string
  | Record<string, string | undefined>
  | null
  | undefined;

export type NuvemshopVariantValue = {
  pt?: string;
  en?: string;
  es?: string;
  [key: string]: string | undefined;
};

export type NuvemshopInventoryLevel = {
  id?: number | string;
  variant_id?: number | string;
  location_id?: string;
  stock?: number | null;
};

export type NuvemshopVariant = {
  id: number | string;
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  promotional_price?: string | null;
  compare_at_price?: string | null;
  cost?: string | null;
  stock?: number | null;
  inventory?: number | null;
  values?: NuvemshopVariantValue[];
  inventory_levels?: NuvemshopInventoryLevel[];
  [key: string]: unknown;
};

export type NuvemshopProduct = {
  id: number | string;
  name?: NuvemshopLocalizedText;
  handle?: NuvemshopLocalizedText;
  description?: NuvemshopLocalizedText;
  canonical_url?: string | null;
  attributes?: NuvemshopVariantValue[];
  images?: Array<{
    id?: number | string;
    src?: string | null;
    alt?: NuvemshopLocalizedText;
    [key: string]: unknown;
  }>;
  published?: boolean | null;
  free_shipping?: boolean | null;
  requires_shipping?: boolean | null;
  has_stock?: boolean | null;
  variants?: NuvemshopVariant[];
  categories?: NuvemshopCategory[];
  tags?: string;
  brand?: string | null;
  [key: string]: unknown;
};

export type NuvemshopCategory = {
  id: number | string;
  name?: NuvemshopLocalizedText;
  handle?: NuvemshopLocalizedText;
  parent?: number | string | null;
  [key: string]: unknown;
};

export type NuvemshopOrderProduct = {
  id: number | string;
  product_id?: number | string | null;
  variant_id?: number | string | null;
  name?: string | null;
  sku?: string | null;
  quantity?: number | null;
  price?: string | null;
  properties?: unknown[];
  variant_values?: unknown[];
  [key: string]: unknown;
};

export type NuvemshopOrder = {
  id: number | string;
  number?: number | string | null;
  token?: string | null;
  contact_email?: string | null;
  contact_name?: string | null;
  status?: string | null;
  payment_status?: string | null;
  shipping_status?: string | null;
  subtotal?: string | null;
  total?: string | null;
  discount?: string | null;
  shipping_cost_owner?: string | null;
  shipping_cost_customer?: string | null;
  gateway?: string | null;
  gateway_name?: string | null;
  shipping_option?: string | null;
  shipping_store_brancher_note?: string | null;
  shipping_carrier_name?: string | null;
  coupon?: Array<{
    id?: number | string;
    code?: string | null;
    value?: string | null;
    type?: string | null;
    [key: string]: unknown;
  }> | null;
  payment_details?: {
    method?: string | null;
    credit_card_company?: string | null;
    installments?: number | null;
    [key: string]: unknown;
  } | null;
  fulfillments?: Array<{
    id?: string;
    number?: string;
    status?: string;
    assigned_location?: {
      location_id?: string;
      name?: string | null;
    } | null;
    shipping?: {
      type?: string;
      carrier?: {
        name?: string | null;
      } | null;
      option?: {
        name?: string | null;
      } | null;
      [key: string]: unknown;
    } | null;
    tracking_info?: {
      code?: string | null;
      url?: string | null;
    } | null;
    [key: string]: unknown;
  }> | null;
  products?: NuvemshopOrderProduct[];
  customer?: {
    id?: number | string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    [key: string]: unknown;
  } | null;
  created_at?: string | null;
  updated_at?: string | null;
  shipped_at?: string | null;
  paid_at?: string | null;
  [key: string]: unknown;
};

export type DiagnosticsResourceResult = {
  label: string;
  ok: boolean;
  count: number | null;
  sample: unknown;
  error?: string;
};

export type NuvemshopDiagnostics = {
  status: "nao_configurado" | "conectado" | "erro";
  checkedAt: string;
  missingEnv: string[];
  config: {
    baseUrl: string;
    storeId: string | null;
    userAgent: string | null;
  };
  resources: DiagnosticsResourceResult[];
};
