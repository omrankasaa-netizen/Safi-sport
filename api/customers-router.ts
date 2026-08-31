import { z } from "zod";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { customers, orderItems, orders } from "@db/schema";
import { createRouter, managerQuery } from "./middleware";
import { getDb } from "./queries/connection";

/** Customers (SPEC §4 customers.*) — manager-only, includes order history. */
export const customersRouter = createRouter({
  list: managerQuery
    .input(
      z.object({
        search: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const condition = input.search
        ? or(
            like(customers.fullName, `%${input.search.replace(/[%_]/g, "")}%`),
            like(customers.phone, `%${input.search.replace(/[%_]/g, "")}%`),
          )
        : undefined;
      const [rows, [{ n }]] = await Promise.all([
        db
          .select()
          .from(customers)
          .where(condition)
          .orderBy(desc(customers.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db.select({ n: sql<number>`count(*)` }).from(customers).where(condition),
      ]);
      return { items: rows, total: Number(n), page: input.page, pageSize: input.pageSize };
    }),

  detail: managerQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [customer] = await db.select().from(customers).where(eq(customers.id, input.id)).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.customerId, customer.id))
        .orderBy(desc(orders.createdAt))
        .limit(100);
      const itemRows = orderRows.length
        ? await db
            .select()
            .from(orderItems)
            .where(sql`${orderItems.orderId} IN (${sql.join(orderRows.map((o) => sql`${o.id}`), sql`, `)})`)
        : [];
      const itemsByOrder = new Map<number, typeof itemRows>();
      for (const item of itemRows) {
        itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
      }
      const totals = {
        ordersCount: orderRows.length,
        totalSpentCents: orderRows.filter((o) => o.status !== "cancelled").reduce((n, o) => n + o.totalCents, 0),
      };
      return {
        customer,
        totals,
        orders: orderRows.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })),
      };
    }),
});
