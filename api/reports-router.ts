import { z } from "zod";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { orderItems, orders } from "@db/schema";
import { createRouter, managerQuery, ownerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";

/**
 * Reports (SPEC §4 reports.*). All figures come from orders/order_items and
 * exclude cancelled orders. Manager+; `financials` is owner-only.
 */

const rangeInput = z.object({
  /** How many days back (including today). */
  days: z.number().int().min(1).max(365).default(30),
  branchId: z.coerce.number().int().positive().optional(),
});

function sinceDays(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

const NOT_CANCELLED = ne(orders.status, "cancelled");

export const reportsRouter = createRouter({
  todaySales: managerQuery.query(async () => {
    const db = getDb();
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`, count: sql<number>`count(*)` })
      .from(orders)
      .where(and(NOT_CANCELLED, gte(orders.createdAt, sinceDays(1))));
    return { totalCents: Number(row.total), ordersCount: Number(row.count), currency: env.currency };
  }),

  salesByDay: managerQuery.input(rangeInput).query(async ({ input }) => {
    const db = getDb();
    const since = sinceDays(input.days);
    if (input.branchId) {
      // Branch filter goes through the fulfilment branch of each line.
      const rows = await db
        .select({
          day: sql<string>`DATE(${orders.createdAt})`,
          total: sql<number>`coalesce(sum(${orderItems.qty} * ${orderItems.unitPriceCents}), 0)`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(NOT_CANCELLED, gte(orders.createdAt, since), eq(orderItems.sourceBranchId, input.branchId)))
        .groupBy(sql`DATE(${orders.createdAt})`)
        .orderBy(sql`DATE(${orders.createdAt})`);
      return rows.map((r) => ({ day: String(r.day), totalCents: Number(r.total) }));
    }
    const rows = await db
      .select({
        day: sql<string>`DATE(${orders.createdAt})`,
        total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .where(and(NOT_CANCELLED, gte(orders.createdAt, since)))
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt})`);
    return rows.map((r) => ({ day: String(r.day), totalCents: Number(r.total), ordersCount: Number(r.count) }));
  }),

  bestSellers: managerQuery
    .input(z.object({ days: z.number().int().min(1).max(365).default(30), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          variantId: orderItems.variantId,
          productName: orderItems.productName,
          color: orderItems.color,
          size: orderItems.size,
          qty: sql<number>`sum(${orderItems.qty})`,
          revenue: sql<number>`sum(${orderItems.qty} * ${orderItems.unitPriceCents})`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(NOT_CANCELLED, gte(orders.createdAt, sinceDays(input.days))))
        .groupBy(orderItems.variantId, orderItems.productName, orderItems.color, orderItems.size)
        .orderBy(desc(sql`sum(${orderItems.qty})`))
        .limit(input.limit);
      return rows.map((r) => ({ ...r, qty: Number(r.qty), revenueCents: Number(r.revenue) }));
    }),

  returnsRate: managerQuery.input(rangeInput).query(async ({ input }) => {
    const db = getDb();
    const [row] = await db
      .select({
        returned: sql<number>`sum(case when ${orders.status} = 'returned' then 1 else 0 end)`,
        completed: sql<number>`sum(case when ${orders.status} in ('delivered','returned') then 1 else 0 end)`,
      })
      .from(orders)
      .where(gte(orders.createdAt, sinceDays(input.days)));
    const returned = Number(row.returned ?? 0);
    const completed = Number(row.completed ?? 0);
    return { returned, completed, rate: completed > 0 ? returned / completed : 0 };
  }),

  pendingOrdersCount: managerQuery.query(async () => {
    const db = getDb();
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(inArray(orders.status, ["new", "confirmed", "preparing"]));
    return { count: Number(row.n) };
  }),

  // COD money still to be collected: orders past 'new' that aren't delivered.
  codOutstanding: managerQuery.query(async () => {
    const db = getDb();
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`, count: sql<number>`count(*)` })
      .from(orders)
      .where(inArray(orders.status, ["confirmed", "preparing", "ready_for_pickup", "out_for_delivery"]));
    return { totalCents: Number(row.total), ordersCount: Number(row.count), currency: env.currency };
  }),

  // Owner-only financial summary (SPEC §4: financials owner-only).
  financials: ownerQuery.input(rangeInput).query(async ({ input }) => {
    const db = getDb();
    const since = sinceDays(input.days);
    const [row] = await db
      .select({
        revenue: sql<number>`coalesce(sum(case when ${orders.status} != 'cancelled' then ${orders.totalCents} end), 0)`,
        deliveryFees: sql<number>`coalesce(sum(case when ${orders.status} != 'cancelled' and ${orders.fulfilment} = 'delivery' then ${orders.deliveryFeeCents} end), 0)`,
        returnedValue: sql<number>`coalesce(sum(case when ${orders.status} = 'returned' then ${orders.totalCents} end), 0)`,
        ordersCount: sql<number>`sum(case when ${orders.status} != 'cancelled' then 1 else 0 end)`,
      })
      .from(orders)
      .where(gte(orders.createdAt, since));
    const revenue = Number(row.revenue ?? 0);
    const ordersCount = Number(row.ordersCount ?? 0);
    return {
      currency: env.currency,
      days: input.days,
      revenueCents: revenue,
      deliveryFeesCents: Number(row.deliveryFees ?? 0),
      returnedValueCents: Number(row.returnedValue ?? 0),
      ordersCount,
      averageOrderValueCents: ordersCount > 0 ? Math.round(revenue / ordersCount) : 0,
    };
  }),
});
