import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

const DROPP_API_BASE = "https://api.external.dropp.fans/v1";
const DROPP_PENDING_REFRESH_MS = 12_000;

export const DROPP_EVERCOIN_BUNDLES = [
  {
    code: "ec500",
    coins: 500,
    amountMinor: 499,
    linkName: "500 EverCoin",
    shareLinkId: "link_uC6mIKmFxIR6lmy9Rekx"
  },
  {
    code: "ec1000",
    coins: 1000,
    amountMinor: 999,
    linkName: "1000 EverCoin",
    shareLinkId: "link_LDIW1x1ZWFgebBf9Dqit"
  },
  {
    code: "ec5000",
    coins: 5000,
    amountMinor: 4999,
    linkName: "5000 EverCoin",
    shareLinkId: "link_H41eGpEcC7ov838WDqaF"
  }
] as const;

export type DroppBundleCode = (typeof DROPP_EVERCOIN_BUNDLES)[number]["code"];

export type DroppPaymentOrder = {
  id: string;
  user_id: string;
  rail: string;
  provider: string;
  pack_code: string;
  coins: number;
  amount_minor: number;
  currency_code: string;
  status: string;
  provider_reference: string | null;
  checkout_url: string | null;
  provider_state: string | null;
  external_transaction_id: string | null;
  last_checked_at: string | null;
  paid_at: string | null;
};

type DroppLinkCopy = {
  id?: string;
  slug?: string;
  checkout_url?: string;
  metadata?: Record<string, unknown> | null;
};

type DroppCopyResponse = {
  link_id?: string;
  copy?: DroppLinkCopy;
};

type DroppOrderPayload = {
  id?: string;
  status?: string;
  type?: string;
  amount?: {
    subtotal_cents?: number;
    total_cents?: number;
    currency_code?: string;
  } | null;
  link?: {
    id?: string;
    name?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
};

type DroppTransaction = {
  id?: string;
  refunded?: boolean;
  amount?: {
    net_cents?: number;
    currency_code?: string;
  } | null;
  order?: {
    id?: string;
    paid_at?: string | null;
  } | null;
};

type CursorEnvelope<T> = {
  data?: T[];
  pagination?: {
    has_more?: boolean;
    next_cursor?: string | null;
  } | null;
};

function apiKey() {
  const value = process.env.DROPP_API_KEY?.trim();
  if (!value) throw new Error("DROPP_NOT_CONFIGURED");
  return value;
}

function webhookSecret() {
  const value = process.env.DROPP_WEBHOOK_SECRET?.trim();
  if (!value) throw new Error("DROPP_WEBHOOK_NOT_CONFIGURED");
  return value;
}

const DROPP_LINK_CACHE_MS = 5 * 60_000;
const resolvedBundleLinkIds = new Map<
  DroppBundleCode,
  { id: string; expiresAt: number }
>();

function droppLinkRows(payload: unknown): Record<string, unknown>[] {
  const object = objectRecord(payload);
  if (!object) return [];

  const nested = objectRecord(object.data);
  const candidates = [object.data, object.links, nested?.data, nested?.links];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((value) => objectRecord(value))
        .filter((value): value is Record<string, unknown> => Boolean(value));
    }
  }

  return [];
}

function droppLinkPriceMinor(link: Record<string, unknown>) {
  const amount = objectRecord(link.amount);
  return integerMinor(
    link.price ??
      link.price_cents ??
      link.amount_minor ??
      amount?.subtotal_cents ??
      amount?.total_cents
  );
}

function droppLinkCurrency(link: Record<string, unknown>) {
  const amount = objectRecord(link.amount);
  const value =
    (typeof link.currency_code === "string" && link.currency_code) ||
    (typeof amount?.currency_code === "string" && amount.currency_code) ||
    "";
  return value.trim().toUpperCase();
}

function droppLinkIsActive(link: Record<string, unknown>) {
  if (link.active === false) return false;
  const status =
    typeof link.status === "string" ? link.status.trim().toLowerCase() : "";
  return status !== "archived" && status !== "deleted" && status !== "inactive";
}

function droppLinkContainsShareId(
  link: Record<string, unknown>,
  shareLinkId: string
) {
  try {
    return JSON.stringify(link).includes(shareLinkId);
  } catch {
    return false;
  }
}

async function resolveBundleLinkId(
  bundle: (typeof DROPP_EVERCOIN_BUNDLES)[number]
) {
  const cached = resolvedBundleLinkIds.get(bundle.code);
  if (cached && cached.expiresAt > Date.now()) return cached.id;

  const response = await droppRequest<unknown>("/links?limit=100");
  const links = droppLinkRows(response).filter(droppLinkIsActive);

  const exactShareMatch = links.find((link) =>
    droppLinkContainsShareId(link, bundle.shareLinkId)
  );

  const named = links.filter((link) => {
    const name =
      typeof link.name === "string" ? link.name.trim().toLowerCase() : "";
    return name === bundle.linkName.toLowerCase();
  });

  const exactPrice = named.filter((link) => {
    const price = droppLinkPriceMinor(link);
    const currency = droppLinkCurrency(link);
    return price === bundle.amountMinor && (!currency || currency === "USD");
  });

  const chosen =
    exactShareMatch ??
    (exactPrice.length === 1 ? exactPrice[0] : null) ??
    (named.length === 1 ? named[0] : null);

  const id = chosen && typeof chosen.id === "string" ? chosen.id.trim() : "";

  if (!id) {
    throw new Error(
      named.length > 1 || exactPrice.length > 1
        ? `DROPP_BUNDLE_LINK_AMBIGUOUS:${bundle.code}`
        : `DROPP_BUNDLE_LINK_NOT_FOUND:${bundle.code}`
    );
  }

  resolvedBundleLinkIds.set(bundle.code, {
    id,
    expiresAt: Date.now() + DROPP_LINK_CACHE_MS
  });

  return id;
}

export function droppConfigured() {
  return Boolean(process.env.DROPP_API_KEY?.trim());
}

export function publicDroppBundles() {
  return DROPP_EVERCOIN_BUNDLES.map(({ code, coins, amountMinor }) => ({
    code,
    coins,
    amountMinor
  }));
}

function getBundle(code: string) {
  return DROPP_EVERCOIN_BUNDLES.find((bundle) => bundle.code === code) ?? null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function integerMinor(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && Number.isSafeInteger(number) ? number : null;
}

function unwrapData<T>(payload: unknown): T | null {
  const object = objectRecord(payload);
  if (!object) return null;
  const nested = objectRecord(object.data);
  return (nested ?? object) as T;
}

function errorDetail(payload: unknown, status: number) {
  const object = objectRecord(payload);
  const error = objectRecord(object?.error);
  const detail =
    (typeof error?.message === "string" && error.message) ||
    (typeof object?.message === "string" && object.message) ||
    (typeof object?.error === "string" && object.error) ||
    `HTTP_${status}`;
  return detail.slice(0, 240);
}

async function droppRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${DROPP_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {})
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new Error(
      `DROPP_API_FAILED:${response.status}:${errorDetail(payload, response.status)}`
    );
  }

  return payload as T;
}

function validCheckoutUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname.toLowerCase() !== "app.dropp.fans"
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

async function updateOrder(orderId: string, values: Record<string, unknown>) {
  const { error } = await getSupabaseServiceClient()
    .from("evercoin_payment_orders")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("provider", "dropp");
  if (error) throw error;
}

const ORDER_SELECT =
  "id,user_id,rail,provider,pack_code,coins,amount_minor,currency_code,status,provider_reference,checkout_url,provider_state,external_transaction_id,last_checked_at,paid_at";

export async function getDroppOrderForUser(orderId: string, userId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("evercoin_payment_orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("user_id", userId)
    .eq("provider", "dropp")
    .maybeSingle();
  if (error) throw error;
  return (data as DroppPaymentOrder | null) ?? null;
}

async function getDroppOrderById(orderId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("evercoin_payment_orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("provider", "dropp")
    .maybeSingle();
  if (error) throw error;
  return (data as DroppPaymentOrder | null) ?? null;
}

async function getDroppOrderByExternalOrderId(droppOrderId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("evercoin_payment_orders")
    .select(ORDER_SELECT)
    .eq("provider", "dropp")
    .eq("external_transaction_id", `dropp:${droppOrderId}`)
    .maybeSingle();
  if (error) throw error;
  return (data as DroppPaymentOrder | null) ?? null;
}

function everBondMetadata(values: {
  orderId: string;
  userId: string;
  bundleCode: string;
  amountMinor: number;
}) {
  return {
    purpose: "evercoin",
    everbond_order_id: values.orderId,
    everbond_user_id: values.userId,
    bundle_code: values.bundleCode,
    amount_minor: String(values.amountMinor),
    evercoin: String(
      getBundle(values.bundleCode)?.coins ?? values.amountMinor
    )
  };
}

export async function createDroppEverCoinCheckout(values: {
  userId: string;
  bundleCode: string;
}) {
  if (!droppConfigured()) throw new Error("DROPP_NOT_CONFIGURED");

  const bundle = getBundle(values.bundleCode);
  if (!bundle) throw new Error("DROPP_BUNDLE_INVALID");

  const baseLinkId = await resolveBundleLinkId(bundle);
  if (!baseLinkId) throw new Error("DROPP_BUNDLE_NOT_CONFIGURED");

  const supabase = getSupabaseServiceClient();
  const { data: inserted, error: insertError } = await supabase
    .from("evercoin_payment_orders")
    .insert({
      user_id: values.userId,
      rail: "card",
      provider: "dropp",
      pack_code: bundle.code,
      coins: bundle.coins,
      amount_minor: bundle.amountMinor,
      currency_code: "USD",
      status: "pending",
      provider_state: "MINTING_LINK_COPY"
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw insertError ?? new Error("DROPP_ORDER_INSERT_FAILED");
  }

  const orderId = String(inserted.id);

  try {
    const response = await droppRequest<unknown>(
      `/links/${encodeURIComponent(baseLinkId)}/copies`,
      {
        method: "POST",
        headers: { "Idempotency-Key": `everbond-${orderId}` },
        body: JSON.stringify({
          metadata: everBondMetadata({
            orderId,
            userId: values.userId,
            bundleCode: bundle.code,
            amountMinor: bundle.amountMinor
          })
        })
      }
    );

    const result = unwrapData<DroppCopyResponse>(response);
    const linkId =
      typeof result?.link_id === "string" ? result.link_id.trim() : "";
    const copy = objectRecord(result?.copy) as DroppLinkCopy | null;
    const copyId = typeof copy?.id === "string" ? copy.id.trim() : "";
    const checkoutUrl = validCheckoutUrl(copy?.checkout_url);

    if (linkId !== baseLinkId || !copyId || !checkoutUrl) {
      throw new Error("DROPP_INVALID_COPY_RESPONSE");
    }

    // provider_reference has a UNIQUE database constraint. A base DROPP link
    // is reused for every purchase, so storing the base link here prevents a
    // second checkout. Store the unique link-copy ID instead.
    await updateOrder(orderId, {
      provider_reference: copyId,
      checkout_url: checkoutUrl,
      provider_state: "LINK_COPY_CREATED",
      last_checked_at: null,
      error_code: null
    });

    return {
      orderId,
      mode: "redirect" as const,
      provider: "dropp" as const,
      bundleCode: bundle.code,
      coins: bundle.coins,
      amountMinor: bundle.amountMinor,
      url: checkoutUrl
    };
  } catch (error) {
    await updateOrder(orderId, {
      status: "failed",
      provider_state: "LINK_COPY_FAILED",
      error_code:
        error instanceof Error
          ? error.message.slice(0, 240)
          : "DROPP_COPY_FAILED"
    }).catch(() => undefined);
    throw error;
  }
}

function metadataOrderId(payload: DroppOrderPayload) {
  const metadata = objectRecord(payload.metadata);
  return typeof metadata?.everbond_order_id === "string"
    ? metadata.everbond_order_id.trim()
    : "";
}

function assertDroppOrderMatches(
  order: DroppPaymentOrder,
  payload: DroppOrderPayload,
  requirePaid: boolean,
  expectedBaseLinkId: string
) {
  const status = String(payload.status ?? "").toLowerCase();
  if (requirePaid && status !== "paid")
    throw new Error("DROPP_ORDER_NOT_PAID");

  const type = String(payload.type ?? "purchase").toLowerCase();
  if (type !== "purchase") throw new Error("DROPP_ORDER_TYPE_MISMATCH");

  const metadata = objectRecord(payload.metadata);
  if (!metadata || metadata.purpose !== "evercoin") {
    throw new Error("DROPP_ORDER_METADATA_MISSING");
  }
  if (metadata.everbond_order_id !== order.id) {
    throw new Error("DROPP_ORDER_ID_MISMATCH");
  }
  if (
    typeof metadata.everbond_user_id === "string" &&
    metadata.everbond_user_id !== order.user_id
  ) {
    throw new Error("DROPP_ORDER_USER_MISMATCH");
  }
  if (
    typeof metadata.bundle_code === "string" &&
    metadata.bundle_code !== order.pack_code
  ) {
    throw new Error("DROPP_ORDER_BUNDLE_MISMATCH");
  }

  const amount = objectRecord(payload.amount);
  const subtotal = integerMinor(amount?.subtotal_cents ?? amount?.total_cents);
  if (subtotal === null || subtotal !== order.amount_minor) {
    throw new Error("DROPP_ORDER_AMOUNT_MISMATCH");
  }

  const currency =
    typeof amount?.currency_code === "string"
      ? amount.currency_code.toUpperCase()
      : "";
  if (currency !== order.currency_code.toUpperCase()) {
    throw new Error("DROPP_ORDER_CURRENCY_MISMATCH");
  }

  const link = objectRecord(payload.link);
  const linkId = typeof link?.id === "string" ? link.id.trim() : "";
  if (!expectedBaseLinkId || linkId !== expectedBaseLinkId) {
    throw new Error("DROPP_ORDER_LINK_MISMATCH");
  }
}

async function ensureDroppCashLot(
  order: DroppPaymentOrder,
  droppOrderId: string
) {
  const { error } = await getSupabaseServiceClient()
    .from("evercoin_cash_lots")
    .upsert(
      {
        payment_order_id: order.id,
        user_id: order.user_id,
        coins_granted: order.coins,
        coins_remaining: order.coins,
        gross_minor: order.amount_minor,
        currency_code: order.currency_code.toUpperCase(),
        dropp_order_id: droppOrderId,
        status: "active",
        updated_at: new Date().toISOString()
      },
      { onConflict: "payment_order_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

async function syncDroppCashLotNet(values: {
  order: DroppPaymentOrder;
  droppOrderId: string;
  transactionId: string;
  netMinor: number;
  currencyCode: string;
}) {
  if (values.currencyCode.toUpperCase() !== values.order.currency_code.toUpperCase()) {
    console.error("DROPP finance currency mismatch", {
      orderId: values.order.id,
      expected: values.order.currency_code,
      received: values.currencyCode
    });
    return false;
  }

  await ensureDroppCashLot(values.order, values.droppOrderId);

  const { error } = await getSupabaseServiceClient()
    .from("evercoin_cash_lots")
    .update({
      net_minor: values.netMinor,
      dropp_transaction_id: values.transactionId,
      updated_at: new Date().toISOString()
    })
    .eq("payment_order_id", values.order.id)
    .eq("dropp_order_id", values.droppOrderId);
  if (error) throw error;
  return true;
}

async function markDroppCashLotRefunded(orderId: string) {
  const { error } = await getSupabaseServiceClient()
    .from("evercoin_cash_lots")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("payment_order_id", orderId);
  if (error) throw error;
}

export async function fulfillDroppPaidOrder(
  payload: DroppOrderPayload,
  occurredAt?: string | null
) {
  const orderId = metadataOrderId(payload);
  if (!orderId) throw new Error("DROPP_ORDER_METADATA_MISSING");

  const order = await getDroppOrderById(orderId);
  if (!order) throw new Error("DROPP_EVERBOND_ORDER_NOT_FOUND");

  const bundle = getBundle(order.pack_code);
  if (!bundle) throw new Error("DROPP_BUNDLE_INVALID");
  const expectedBaseLinkId = await resolveBundleLinkId(bundle);
  assertDroppOrderMatches(order, payload, true, expectedBaseLinkId);

  if (order.status === "refunded") {
    throw new Error("DROPP_ORDER_ALREADY_REFUNDED");
  }

  const droppOrderId =
    typeof payload.id === "string" ? payload.id.trim() : "";
  if (!droppOrderId) throw new Error("DROPP_ORDER_PROVIDER_ID_MISSING");
  const externalId = `dropp:${droppOrderId}`;

  if (order.status === "paid") {
    if (
      order.external_transaction_id &&
      order.external_transaction_id !== externalId
    ) {
      throw new Error("DROPP_ORDER_EXTERNAL_ID_CONFLICT");
    }
    await ensureDroppCashLot(order, droppOrderId);
    return { status: "paid" as const, coins: order.coins, balance: null };
  }

  const supabase = getSupabaseServiceClient();
  const { error: creditError } = await supabase.rpc(
    "credit_evercoin_purchase",
    {
      p_user_id: order.user_id,
      p_transaction_id: externalId,
      p_price_id: `dropp:card:${order.pack_code}`,
      p_pack_code: order.pack_code,
      p_coins: order.coins,
      p_total_minor: order.amount_minor,
      p_currency_code: order.currency_code
    }
  );
  if (creditError) throw creditError;

  const paidAt =
    typeof occurredAt === "string" && !Number.isNaN(Date.parse(occurredAt))
      ? occurredAt
      : new Date().toISOString();

  await updateOrder(order.id, {
    status: "paid",
    external_transaction_id: externalId,
    provider_state: "PAID",
    paid_at: order.paid_at || paidAt,
    last_checked_at: new Date().toISOString(),
    error_code: null
  });

  await ensureDroppCashLot(
    { ...order, status: "paid", external_transaction_id: externalId },
    droppOrderId
  );

  return { status: "paid" as const, coins: order.coins, balance: null };
}

async function reverseDroppOrder(
  order: DroppPaymentOrder,
  adjustmentId: string
) {
  if (order.status === "refunded") return true;

  if (order.external_transaction_id) {
    const { error } = await getSupabaseServiceClient().rpc(
      "reverse_evercoin_purchase",
      {
        p_transaction_id: order.external_transaction_id,
        p_adjustment_id: adjustmentId,
        p_action: "refund",
        p_status: "approved",
        p_coins: order.coins
      }
    );
    if (error) throw error;
  }

  await updateOrder(order.id, {
    status: "refunded",
    provider_state: "REFUNDED",
    last_checked_at: new Date().toISOString(),
    error_code: null
  });
  await markDroppCashLotRefunded(order.id);
  return true;
}

export async function reverseDroppRefundedOrder(
  payload: DroppOrderPayload,
  eventId: string
) {
  const embeddedOrderId = metadataOrderId(payload);
  const droppOrderId =
    typeof payload.id === "string" ? payload.id.trim() : "";

  const order = embeddedOrderId
    ? await getDroppOrderById(embeddedOrderId)
    : droppOrderId
      ? await getDroppOrderByExternalOrderId(droppOrderId)
      : null;

  if (!order) throw new Error("DROPP_REFUND_ORDER_NOT_FOUND");

  if (embeddedOrderId) {
    const bundle = getBundle(order.pack_code);
    if (!bundle) throw new Error("DROPP_BUNDLE_INVALID");
    const expectedBaseLinkId = await resolveBundleLinkId(bundle);
    assertDroppOrderMatches(order, payload, false, expectedBaseLinkId);
  }

  return reverseDroppOrder(order, `dropp-refund:${eventId}`);
}

function recentlyChecked(order: DroppPaymentOrder) {
  if (!order.last_checked_at) return false;
  const checked = Date.parse(order.last_checked_at);
  return (
    Number.isFinite(checked) && Date.now() - checked < DROPP_PENDING_REFRESH_MS
  );
}

function payloadArray<T>(value: unknown): T[] {
  const object = objectRecord(value);
  return Array.isArray(object?.data) ? (object.data as T[]) : [];
}

export async function refreshDroppOrder(order: DroppPaymentOrder) {
  if (order.status === "refunded") {
    return { status: "refunded" as const, coins: 0, balance: null };
  }
  if (
    order.status === "failed" ||
    order.status === "expired" ||
    order.status === "cancelled"
  ) {
    return { status: order.status, coins: 0, balance: null };
  }
  if (order.status === "paid") {
    return { status: "paid" as const, coins: order.coins, balance: null };
  }
  if (!order.provider_reference || recentlyChecked(order)) {
    return { status: "pending" as const, coins: 0, balance: null };
  }

  const bundle = getBundle(order.pack_code);
  if (!bundle) {
    throw new Error("DROPP_BUNDLE_INVALID");
  }
  const baseLinkId = await resolveBundleLinkId(bundle);

  const response = await droppRequest<unknown>(
    `/orders?link_id=${encodeURIComponent(baseLinkId)}&limit=100`
  );

  await updateOrder(order.id, {
    last_checked_at: new Date().toISOString()
  });

  const matching = payloadArray<DroppOrderPayload>(response).find(
    (candidate) => metadataOrderId(candidate) === order.id
  );

  if (!matching) {
    return { status: "pending" as const, coins: 0, balance: null };
  }

  const status = String(matching.status ?? "").toLowerCase();
  if (status === "paid") {
    return fulfillDroppPaidOrder(matching);
  }
  if (status === "refunded") {
    await reverseDroppRefundedOrder(
      matching,
      `status-${String(matching.id ?? order.id)}`
    );
    return { status: "refunded" as const, coins: 0, balance: null };
  }

  return { status: "pending" as const, coins: 0, balance: null };
}

export async function reconcileRecentDroppRefunds(maxPages = 1) {
  if (!droppConfigured()) return { checked: 0, reversed: 0 };

  let cursor = "";
  let checked = 0;
  let reversed = 0;

  for (
    let page = 0;
    page < Math.max(1, Math.min(maxPages, 5));
    page += 1
  ) {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);

    const response = await droppRequest<CursorEnvelope<DroppTransaction>>(
      `/transactions?${query.toString()}`
    );
    const transactions = Array.isArray(response?.data) ? response.data : [];

    for (const transaction of transactions) {
      checked += 1;

      const droppOrderId =
        typeof transaction?.order?.id === "string"
          ? transaction.order.id.trim()
          : "";
      const transactionId =
        typeof transaction?.id === "string" ? transaction.id.trim() : "";
      if (!droppOrderId || !transactionId) continue;

      const local = await getDroppOrderByExternalOrderId(droppOrderId);
      if (!local) continue;

      const netMinor = integerMinor(transaction?.amount?.net_cents);
      const transactionCurrency =
        typeof transaction?.amount?.currency_code === "string"
          ? transaction.amount.currency_code.trim().toUpperCase()
          : "";

      if (
        local.status === "paid" &&
        netMinor !== null &&
        netMinor >= 0 &&
        transactionCurrency
      ) {
        await syncDroppCashLotNet({
          order: local,
          droppOrderId,
          transactionId,
          netMinor,
          currencyCode: transactionCurrency
        });
      }

      if (transaction?.refunded === true && local.status !== "refunded") {
        await reverseDroppOrder(local, `dropp-refund:${transactionId}`);
        reversed += 1;
      }
    }

    const hasMore = response?.pagination?.has_more === true;
    const next = response?.pagination?.next_cursor;
    if (!hasMore || typeof next !== "string" || !next) break;
    cursor = next;
  }

  return { checked, reversed };
}

export async function droppWebhookEventSeen(eventId: string) {
  const { data, error } = await getSupabaseServiceClient()
    .from("dropp_webhook_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function recordDroppWebhookEvent(
  eventId: string,
  eventType: string,
  payload: unknown
) {
  const { error } = await getSupabaseServiceClient()
    .from("dropp_webhook_events")
    .upsert(
      {
        event_id: eventId,
        event_type: eventType,
        payload
      },
      { onConflict: "event_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

export function verifyDroppWebhookSignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null
) {
  if (!timestampHeader || !signatureHeader) return false;

  const timestampText = timestampHeader.trim();
  const timestamp = Number.parseInt(timestampText, 10);
  if (!/^\d+$/.test(timestampText) || !Number.isSafeInteger(timestamp))
    return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  const signature = signatureHeader.trim().toLowerCase();
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", webhookSecret())
      .update(`${timestampText}.${rawBody}`, "utf8")
      .digest("hex");

  const received = Buffer.from(signature, "utf8");
  const calculated = Buffer.from(expected, "utf8");
  return (
    received.length === calculated.length &&
    timingSafeEqual(received, calculated)
  );
}
