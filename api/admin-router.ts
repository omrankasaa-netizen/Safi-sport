import { desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { lowStockAlerts, orders, syncConflicts, syncRuns } from "@db/schema";
import { createRouter, viewerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import { getDriver } from "./integrations/rbmsoft/syncService";

/** Admin dashboard summary (SPEC §6 Dashboard) — viewer-level read-only. */
export const adminRouter = createRouter({
  dashboard: viewerQuery.query(async () => {
    const db = getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [sales, pending, lowStock, conflicts, lastRun, recentOrders] = await Promise.all([
      db
        .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)`, count: sql<number>`count(*)` })
        .from(orders)
        .where(gte(orders.createdAt, today)),
      db
        .select({ n: sql<number>`count(*)` })
        .from(orders)
        .where(inArray(orders.status, ["new", "confirmed", "preparing"])),
      db.select({ n: sql<number>`count(*)` }).from(lowStockAlerts).where(eq(lowStockAlerts.status, "open")),
      db.select({ n: sql<number>`count(*)` }).from(syncConflicts).where(isNull(syncConflicts.resolvedAt)),
      db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10),
    ]);
    return {
      currency: env.currency,
      todaySalesCents: Number(sales[0]?.total ?? 0),
      todayOrdersCount: Number(sales[0]?.count ?? 0),
      pendingOrdersCount: Number(pending[0]?.n ?? 0),
      lowStockCount: Number(lowStock[0]?.n ?? 0),
      unresolvedConflicts: Number(conflicts[0]?.n ?? 0),
      sync: { driver: getDriver().name, enabled: env.syncEnabled, lastRun: lastRun[0] ?? null },
      recentOrders,
    };
  }),
});
