import "server-only";
import { db } from "./index";
import type { BuyOffer, Channel, CostSettings, SellReference } from "../domain/opportunity";
import { evaluateProduct, type ProductOpportunity } from "../domain/opportunity";

export type Source = {
  id: string; name: string; kind: string; base_url: string | null; can_buy: boolean; can_sell: boolean;
  integration_status: string; access_method: string; access_notes: string | null;
  last_success_at: Date | null; last_error: string | null;
};

export type Category = { id: number; slug: string; name: string; kdv_rate: number };

export type Product = {
  id: number; brand: string; model_code: string; gtin: string | null; name: string;
  category_id: number; category_name: string; kdv_rate: number; energy_class: string | null; is_active: boolean;
};

export type LatestOffer = {
  offer_id: number; source_id: string; source_name: string; side: "buy" | "sell"; product_id: number | null;
  match_method: string | null; source_url: string; seller_name: string | null; title: string | null;
  observation_id: number; observed_at: Date; origin: BuyOffer["origin"]; collected_by: string;
  price: number; shipping_fee: number | null; in_stock: boolean | null; stock_qty: number | null;
  delivery: BuyOffer["delivery"]; delivery_method_note: string | null; delivery_days: number | null;
  regional_restriction: string | null; invoice: BuyOffer["invoice"]; warranty: BuyOffer["warranty"];
  warranty_months: number | null; condition: BuyOffer["condition"];
};

export type ChannelRow = {
  id: string; name: string; source_id: string | null; kind: string; commission_rate: number;
  payment_fee_rate: number; fixed_fee_net: number; outbound_shipping_net: number; return_rate: number;
  withholding_rate: number; params_verified: boolean; notes: string | null;
};

export type FulfillmentMethod = { id: string; name: string; cost_net: number; cost_per_km: number; notes: string | null };

export async function getSources(): Promise<Source[]> {
  const r = await db().query("select * from sources order by kind, name");
  return r.rows;
}

export async function getCategories(): Promise<Category[]> {
  return (await db().query("select id, slug, name, kdv_rate from categories order by name")).rows;
}

export async function getSettingsRow() {
  return (await db().query("select * from cost_settings where id = 1")).rows[0];
}

export async function getSettings(): Promise<CostSettings> {
  const s = await getSettingsRow();
  return {
    inboundShippingNet: s.inbound_shipping_net,
    handlingNet: s.handling_net,
    annualCapitalCostRate: s.annual_capital_cost_rate,
    avgDaysInStock: s.avg_days_in_stock,
    storageCostMonthNet: s.storage_cost_month_net,
    returnLossRate: s.return_loss_rate,
    serviceKdvRate: s.service_kdv_rate,
    maxPriceAgeHours: s.max_price_age_hours,
    minProfitNet: s.min_profit_net,
    minMargin: s.min_margin,
  };
}

export async function getChannelRows(): Promise<ChannelRow[]> {
  return (await db().query("select * from sales_channels where is_active order by kind, name")).rows;
}

export async function getCategoryCommissions(): Promise<{ channel_id: string; category_id: number; commission_rate: number }[]> {
  return (await db().query("select * from channel_category_commissions")).rows;
}

export async function getFulfillmentMethods(): Promise<FulfillmentMethod[]> {
  return (await db().query("select * from fulfillment_methods order by id")).rows;
}

/** Kanalları, kategoriye özel komisyon varsa onunla döndürür. */
export function channelsForCategory(
  rows: ChannelRow[],
  overrides: { channel_id: string; category_id: number; commission_rate: number }[],
  categoryId: number,
): Channel[] {
  return rows.map((c) => {
    const o = overrides.find((x) => x.channel_id === c.id && x.category_id === categoryId);
    return {
      id: c.id, name: c.name, sourceId: c.source_id,
      commissionRate: o ? o.commission_rate : c.commission_rate,
      paymentFeeRate: c.payment_fee_rate, fixedFeeNet: c.fixed_fee_net,
      outboundShippingNet: c.outbound_shipping_net, returnRate: c.return_rate,
      withholdingRate: c.withholding_rate, paramsVerified: c.params_verified,
    };
  });
}

const PRODUCT_SELECT = `
  select p.id, p.brand, p.model_code, p.gtin, p.name, p.category_id, c.name as category_name,
         c.kdv_rate, p.energy_class, p.is_active
  from products p join categories c on c.id = p.category_id`;

export async function listProducts(f: { q?: string; category?: string }): Promise<
  (Product & { buy_offers: number; min_buy: number | null; has_test: boolean })[]
> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(p.brand ilike $${params.length} or p.model_code ilike $${params.length} or p.name ilike $${params.length} or p.gtin like $${params.length})`);
  }
  if (f.category) {
    params.push(f.category);
    where.push(`c.slug = $${params.length}`);
  }
  const sql = `
    select x.*, coalesce(s.buy_offers, 0)::int as buy_offers, s.min_buy, coalesce(s.has_test, false) as has_test
    from (${PRODUCT_SELECT} ${where.length ? "where " + where.join(" and ") : ""}) x
    left join (
      select product_id, count(*) as buy_offers, min(price) as min_buy, bool_or(origin = 'test_fixture') as has_test
      from latest_offer_prices where side = 'buy' and product_id is not null group by product_id
    ) s on s.product_id = x.id
    order by x.brand, x.model_code limit 1000`;
  return (await db().query(sql, params)).rows;
}

export async function getProduct(id: number): Promise<Product | null> {
  return (await db().query(`${PRODUCT_SELECT} where p.id = $1`, [id])).rows[0] ?? null;
}

export async function getLatestOffers(productId?: number): Promise<LatestOffer[]> {
  const r = await db().query(
    `select l.*, s.name as source_name from latest_offer_prices l join sources s on s.id = l.source_id
     where l.product_id is not null ${productId ? "and l.product_id = $1" : ""}`,
    productId ? [productId] : [],
  );
  return r.rows;
}

export async function getPriceHistory(productId: number) {
  const r = await db().query(
    `select o.source_id, o.side, p.observed_at, p.price, p.origin
     from price_observations p join offers o on o.id = p.offer_id
     where o.product_id = $1 order by p.observed_at`,
    [productId],
  );
  return r.rows as { source_id: string; side: "buy" | "sell"; observed_at: Date; price: number; origin: string }[];
}

export async function getVelocity(productId?: number) {
  const r = await db().query(
    `select product_id, channel_id, units_per_month, basis from sales_velocity_estimates ${productId ? "where product_id = $1" : ""}`,
    productId ? [productId] : [],
  );
  return r.rows as { product_id: number; channel_id: string; units_per_month: number; basis: string }[];
}

export async function getUnmatchedOffers() {
  return (
    await db().query(
      `select o.id, o.source_id, o.source_url, o.title, o.brand_raw, o.model_code_raw, o.gtin_raw, o.created_at
       from offers o where o.product_id is null order by o.created_at desc limit 200`,
    )
  ).rows;
}

export function toBuyOffer(o: LatestOffer): BuyOffer {
  return {
    offerId: o.offer_id, observationId: o.observation_id, sourceId: o.source_id, sourceUrl: o.source_url,
    sellerName: o.seller_name, shippingFee: o.shipping_fee, origin: o.origin, observedAt: new Date(o.observed_at),
    price: o.price, inStock: o.in_stock, delivery: o.delivery, regionalRestriction: o.regional_restriction,
    invoice: o.invoice, warranty: o.warranty, condition: o.condition,
  };
}

/** Satış tarafı gözlemlerini kanal referanslarına çevirir (kanalın bağlı olduğu kaynak üzerinden). */
export function toSellRefs(offers: LatestOffer[], channels: Channel[]): SellReference[] {
  const refs: SellReference[] = [];
  for (const o of offers) {
    if (o.side !== "sell") continue;
    for (const ch of channels) {
      if (ch.sourceId === o.source_id) {
        refs.push({ channelId: ch.id, price: o.price, observedAt: new Date(o.observed_at), isTest: o.origin === "test_fixture" });
      }
    }
  }
  return refs;
}

export type OpportunityRow = { product: Product; result: ProductOpportunity };

/** Tüm aktif ürünler için fırsat değerlendirmesi (pilot ölçeği: ~300 ürün × 20 kaynak). */
export async function evaluateAll(now = new Date()): Promise<OpportunityRow[]> {
  const [products, offers, chRows, overrides, settings, velocity] = await Promise.all([
    db().query(`${PRODUCT_SELECT} where p.is_active`).then((r) => r.rows as Product[]),
    getLatestOffers(),
    getChannelRows(),
    getCategoryCommissions(),
    getSettings(),
    getVelocity(),
  ]);
  const byProduct = new Map<number, LatestOffer[]>();
  for (const o of offers) {
    const list = byProduct.get(o.product_id!) ?? [];
    list.push(o);
    byProduct.set(o.product_id!, list);
  }
  return products.map((p) => {
    const po = byProduct.get(p.id) ?? [];
    const channels = channelsForCategory(chRows, overrides, p.category_id);
    const v: Record<string, number> = {};
    for (const x of velocity) if (x.product_id === p.id) v[x.channel_id] = x.units_per_month;
    return {
      product: p,
      result: evaluateProduct({
        kdvRate: p.kdv_rate,
        buyOffers: po.filter((o) => o.side === "buy").map(toBuyOffer),
        sellRefs: toSellRefs(po, channels),
        channels, velocity: v, settings, now,
      }),
    };
  });
}

export async function getDashboardStats() {
  const r = await db().query(`
    select
      (select count(*) from products where is_active)::int as products,
      (select count(*) from offers where product_id is not null)::int as matched_offers,
      (select count(*) from offers where product_id is null)::int as unmatched_offers,
      (select count(*) from price_observations)::int as observations,
      (select count(*) from price_observations where origin = 'test_fixture')::int as test_observations,
      (select count(*) from sources where integration_status in ('live','sandbox'))::int as connected_sources,
      (select count(*) from sources)::int as sources,
      (select max(observed_at) from price_observations where origin <> 'test_fixture') as last_real_observation`);
  return r.rows[0] as {
    products: number; matched_offers: number; unmatched_offers: number; observations: number;
    test_observations: number; connected_sources: number; sources: number; last_real_observation: Date | null;
  };
}
