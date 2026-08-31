import { z } from "zod";
import * as cookie from "cookie";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLogs,
  branches,
  branchStock,
  customers,
  lowStockAlerts,
  orderItems,
  orders,
  productVariants,
  products,
  stockReservations,
} from "@db/schema";
import { RESERVATION_TTL_MS } from "@contracts/constants";
import { createRouter, publicQuery, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";
import { getSetting } from "./queries/settings";
import { env } from "./lib/env";
import { sendEmail } from "./lib/email";
import { orderCreateLimiter, orderLookupLimiter } from "./lib/rateLimit";
import { availableOf, planFulfilment, OutOfStockError, type StockLine } from "./lib/availability";
import { assertTransition, transitionEffect, InvalidTransitionError } from "./lib/orderPipeline";
import { buildUserData, sendCapiEvent } from "./lib/metaCapi";
import { phoneLookupVariants } from "./lib/phone";

/** Shared zod shape of a guest checkout payload (SPEC §4 checkout.create). */
export const createOrderSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Phone must be E.164"),
  whatsapp: z.string().trim().regex(/^\+[1-9]\d{6,14}$/).optional(),
  email: z.string().trim().email().max(320).optional(),
  fulfilment: z.enum(["delivery", "pickup"]),
  pickupBranchCode: z.enum(["elmina", "dam"]).optional(),
  address: z.string().trim().max(255).optional(),
  area: z.string().trim().max(96).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.coerce.number().int().positive(),
        qty: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(50),
  // Meta Pixel browser-generated event id, persisted for CAPI dedup.
  metaEventId: z.string().max(64).optional(),
  // Honeypot: bots filling this get a fake success, never a real order.
  company: z.string().max(200).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

const OUT_OF_STOCK_MESSAGE = "One or more items just sold out. Please adjust your cart.";

/** Edge-triggered low-stock alert: at most one open alert per variant+branch. */
export async function maybeRaiseLowStock(variantId: number, branchId: number): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(branchStock)
    .where(and(eq(branchStock.variantId, variantId), eq(branchStock.branchId, branchId)))
    .limit(1);
  if (!row) return;
  if (availableOf(row) > row.lowStockThreshold) return;
  const [open] = await db
    .select({ id: lowStockAlerts.id })
    .from(lowStockAlerts)
    .where(
      and(
        eq(lowStockAlerts.variantId, variantId),
        eq(lowStockAlerts.branchId, branchId),
        eq(lowStockAlerts.status, "open"),
      ),
    )
    .limit(1);
  if (open) return;
  await db.insert(lowStockAlerts).values({
    variantId,
    branchId,
    qtyAtAlert: availableOf(row),
    status: "open",
  });
}

async function nextOrderNumber(tx: {
  select: typeof getDb extends () => infer T ? (T extends { select: infer S } ? S : never) : never;
}): Promise<string> {
  // SF-#### sequence derived from the row count. The unique index on
  // orderNumber is the real guard; the caller retries on a duplicate.
  const [{ n }] = await (tx as unknown as ReturnType<typeof getDb>)
    .select({ n: sql<number>`count(*)` })
    .from(orders);
  return `SF-${String(Number(n) + 1).padStart(4, "0")}`;
}

/** Fire-and-forget server-side Purchase CAPI event from trusted order data. */
async function firePurchaseCapi(opts: {
  orderNumber: string;
  totalCents: number;
  items: { sku: string; qty: number; unitPriceCents: number }[];
  fullName: string;
  phone: string;
  email?: string;
  metaEventId?: string;
  req: Request;
  clientIp: string;
}): Promise<void> {
  try {
    const cookies = cookie.parse(opts.req.headers.get("cookie") ?? "");
    const nameParts = opts.fullName.trim().split(/\s+/);
    const userData = buildUserData(
      {
        email: opts.email,
        phone: opts.phone,
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(" "),
        externalId: opts.phone,
      },
      {
        clientIp: opts.clientIp,
        userAgent: opts.req.headers.get("user-agent") ?? undefined,
        fbp: cookies._fbp,
        fbc: cookies._fbc,
      },
    );
    await sendCapiEvent({
      pixelId: env.metaPixelId,
      accessToken: env.metaCapiAccessToken,
      testEventCode: env.metaTestEventCode || undefined,
      eventName: "Purchase",
      // Same deterministic id meta.purchase uses, so a storefront
      // confirmation-page call dedups against this server-side event.
      eventId: opts.metaEventId || `purchase-${opts.orderNumber}`,
      userData,
      customData: {
        value: opts.totalCents / 100,
        currency: env.currency,
        content_type: "product",
        contents: opts.items.map((i) => ({ id: i.sku, quantity: i.qty, item_price: i.unitPriceCents / 100 })),
        num_items: opts.items.reduce((n, i) => n + i.qty, 0),
      },
    });
  } catch (error) {
    console.error("[checkout] Purchase CAPI failed:", (error as Error)?.message);
  }
}

// ── checkout.* (public) ──────────────────────────────────────────────────────
export const checkoutRouter = createRouter({
  create: publicQuery.input(createOrderSchema).mutation(async ({ ctx, input }) => {
    // Honeypot: a filled "company" field means a bot. Fake success so the
    // bot learns nothing, but never create an order.
    if (input.company) {
      return { success: true as const, orderNumber: "SF-0000", totalCents: 0, currency: env.currency };
    }

    if (!orderCreateLimiter.check(ctx.clientIp)) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many orders from this connection. Please try again later." });
    }

    if (input.fulfilment === "pickup" && !input.pickupBranchCode) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Pick a pickup branch." });
    }
    if (input.fulfilment === "delivery" && !input.address) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Delivery address is required." });
    }

    const db = getDb();
    const branchRows = await db.select().from(branches).where(eq(branches.isActive, true));
    const preferredCode = input.fulfilment === "pickup" ? input.pickupBranchCode! : "elmina";
    const preferred = branchRows.find((b) => b.code === preferredCode) ?? branchRows[0];
    if (!preferred) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No active branch configured." });

    const variantIds = [...new Set(input.items.map((i) => i.variantId))];
    const variantRows = await db
      .select({ variant: productVariants, product: products })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, variantIds));
    const byId = new Map(variantRows.map((r) => [r.variant.id, r]));
    for (const item of input.items) {
      const row = byId.get(item.variantId);
      if (!row || !row.variant.isActive || row.product.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An item in your cart is no longer available." });
      }
    }

    const deliveryFeeCents = input.fulfilment === "delivery" ? await getSetting("delivery.feeCents") : 0;
    let subtotalCents = 0;
    for (const item of input.items) {
      const row = byId.get(item.variantId)!;
      subtotalCents += (row.variant.priceOverrideCents ?? row.product.basePriceCents) * item.qty;
    }
    const totalCents = subtotalCents + deliveryFeeCents;

    type Created = { orderId: number; orderNumber: string; needsTransfer: boolean };
    let created: Created | null = null;
    let lastError: unknown = null;

    // Retry loop only covers an orderNumber unique-key race.
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        created = await db.transaction(async (tx): Promise<Created> => {
          // Lock this variant set's stock rows for the duration of the tx so
          // two concurrent checkouts can never both reserve the last unit.
          const stockRows = (await tx
            .select()
            .from(branchStock)
            .where(inArray(branchStock.variantId, variantIds))
            .for("update")) as StockLine[];

          let plan;
          try {
            plan = planFulfilment(input.items, stockRows, preferred.id);
          } catch (error) {
            if (error instanceof OutOfStockError) {
              throw new TRPCError({ code: "CONFLICT", message: OUT_OF_STOCK_MESSAGE });
            }
            throw error;
          }

          // Customer upsert by phone (SPEC §2 customers).
          const [existing] = await tx
            .select()
            .from(customers)
            .where(eq(customers.phone, input.phone))
            .limit(1);
          let customerId: number;
          if (existing) {
            customerId = existing.id;
            await tx
              .update(customers)
              .set({
                fullName: input.fullName,
                whatsapp: input.whatsapp ?? existing.whatsapp,
                email: input.email ?? existing.email,
                address: input.address ?? existing.address,
                area: input.area ?? existing.area,
                updatedAt: new Date(),
              })
              .where(eq(customers.id, existing.id));
          } else {
            const [ins] = await tx
              .insert(customers)
              .values({
                fullName: input.fullName,
                phone: input.phone,
                whatsapp: input.whatsapp ?? null,
                email: input.email ?? null,
                address: input.address ?? null,
                area: input.area ?? null,
              })
              .$returningId();
            customerId = ins.id;
          }

          const orderNumber = await nextOrderNumber(tx as never);
          const [orderIns] = await tx
            .insert(orders)
            .values({
              orderNumber,
              customerId,
              guestName: input.fullName,
              guestPhone: input.phone,
              guestAddress: input.address ?? null,
              guestArea: input.area ?? null,
              fulfilment: input.fulfilment,
              pickupBranchId: input.fulfilment === "pickup" ? preferred.id : null,
              deliveryFeeCents,
              subtotalCents,
              totalCents,
              status: "new",
              needsTransfer: plan.needsTransfer,
              transferFromBranchId: plan.transferFromBranchId,
              metaEventId: input.metaEventId ?? null,
            })
            .$returningId();
          const orderId = orderIns.id;

          const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
          for (const line of plan.lines) {
            const row = byId.get(line.variantId)!;
            await tx.insert(orderItems).values({
              orderId,
              variantId: line.variantId,
              productName: row.product.nameEn,
              color: row.variant.color,
              size: row.variant.size,
              sku: row.variant.sku,
              barcode: row.variant.barcode,
              qty: line.qty,
              unitPriceCents: row.variant.priceOverrideCents ?? row.product.basePriceCents,
              sourceBranchId: line.sourceBranchId,
            });
            // Held reservation: reservedOnline += qty immediately; the
            // qtyOnHand decrement happens when staff confirms the order.
            await tx.insert(stockReservations).values({
              orderId,
              variantId: line.variantId,
              branchId: line.sourceBranchId,
              qty: line.qty,
              status: "held",
              expiresAt,
            });
            await tx
              .update(branchStock)
              .set({ reservedOnline: sql`${branchStock.reservedOnline} + ${line.qty}`, updatedAt: new Date() })
              .where(
                and(eq(branchStock.variantId, line.variantId), eq(branchStock.branchId, line.sourceBranchId)),
              );
          }

          await tx.insert(auditLogs).values({
            actorUserId: null,
            action: "order.placed",
            entity: "order",
            entityId: orderNumber,
            detail: { orderId, itemCount: input.items.length },
          });
          return { orderId, orderNumber, needsTransfer: plan.needsTransfer };
        });
      } catch (error) {
        lastError = error;
        const message = String((error as { message?: unknown })?.message ?? "");
        // Duplicate orderNumber → regenerate and retry; anything else
        // (including our CONFLICT for out-of-stock) propagates.
        if (!/Duplicate entry/.test(message) || !message.includes("orderNumber")) throw error;
      }
    }
    if (!created) throw lastError ?? new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    // Post-commit side effects (best-effort, never fail the order).
    await db
      .update(customers)
      .set({
        ordersCount: sql`${customers.ordersCount} + 1`,
        totalSpentCents: sql`${customers.totalSpentCents} + ${totalCents}`,
        updatedAt: new Date(),
      })
      .where(eq(customers.phone, input.phone));
    await audit(null, "order.created", "order", created.orderNumber, {
      totalCents,
      fulfilment: input.fulfilment,
      needsTransfer: created.needsTransfer,
    });
    if (env.adminNotificationEmail) {
      await sendEmail({
        to: env.adminNotificationEmail,
        subject: `New order ${created.orderNumber}`,
        html: `<p>New COD order <b>${created.orderNumber}</b> — $${(totalCents / 100).toFixed(2)} (${input.fulfilment}).</p>`,
      });
    }
    void firePurchaseCapi({
      orderNumber: created.orderNumber,
      totalCents,
      items: input.items.map((i) => {
        const row = byId.get(i.variantId)!;
        return { sku: row.variant.sku, qty: i.qty, unitPriceCents: row.variant.priceOverrideCents ?? row.product.basePriceCents };
      }),
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      metaEventId: input.metaEventId,
      req: ctx.req,
      clientIp: ctx.clientIp,
    });

    return { success: true as const, orderNumber: created.orderNumber, totalCents, currency: env.currency };
  }),
});

// ── orders.* ─────────────────────────────────────────────────────────────────
const listSchema = z.object({
  status: z
    .enum(["new", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "delivered", "returned", "cancelled"])
    .optional(),
  search: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const orderRouter = createRouter({
  // Public order tracking: orderNumber + phone, throttled, generic errors so
  // the endpoint can't be used to enumerate orders.
  track: publicQuery
    .input(z.object({ orderNumber: z.string().trim().min(3).max(32), phone: z.string().trim().min(6).max(32) }))
    .query(async ({ ctx, input }) => {
      if (!orderLookupLimiter.check(ctx.clientIp)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many lookups. Please try again later." });
      }
      const db = getDb();
      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
      const phones = order ? phoneLookupVariants(input.phone) : [];
      if (!order || !phones.includes(order.guestPhone)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "We couldn't find an order with those details." });
      }
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      return {
        orderNumber: order.orderNumber,
        status: order.status,
        fulfilment: order.fulfilment,
        pickupBranchId: order.pickupBranchId,
        subtotalCents: order.subtotalCents,
        deliveryFeeCents: order.deliveryFeeCents,
        totalCents: order.totalCents,
        createdAt: order.createdAt,
        items: items.map((i) => ({ productName: i.productName, color: i.color, size: i.size, qty: i.qty, unitPriceCents: i.unitPriceCents })),
      };
    }),

  list: staffQuery.input(listSchema).query(async ({ input }) => {
    const db = getDb();
    const where = [];
    if (input.status) where.push(eq(orders.status, input.status));
    if (input.search) {
      const q = `%${input.search.replace(/[%_]/g, "")}%`;
      where.push(
        sql`(${orders.orderNumber} LIKE ${q} OR ${orders.guestName} LIKE ${q} OR ${orders.guestPhone} LIKE ${q})`,
      );
    }
    const condition = where.length ? and(...where) : undefined;
    const [rows, [{ n }]] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(condition)
        .orderBy(sql`${orders.createdAt} DESC`)
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ n: sql<number>`count(*)` }).from(orders).where(condition),
    ]);
    return { items: rows, total: Number(n), page: input.page, pageSize: input.pageSize };
  }),

  detail: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [order] = await db.select().from(orders).where(eq(orders.id, input.id)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const [customer] = order.customerId
        ? await db.select().from(customers).where(eq(customers.id, order.customerId)).limit(1)
        : [null];
      const reservations = await db.select().from(stockReservations).where(eq(stockReservations.orderId, order.id));
      return { order, items, customer, reservations };
    }),

  // Pipeline transition with reservation side effects (SPEC §4 orders.*):
  // confirm commits reservations (decrement qtyOnHand), cancel releases,
  // return restocks. Illegal transitions are rejected.
  setStatus: staffQuery
    .input(
      z.object({
        id: z.coerce.number().int().positive(),
        status: z.enum(["new", "confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "delivered", "returned", "cancelled"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const result = await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, input.id)).for("update").limit(1);
        if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
        try {
          assertTransition(order.status, input.status);
        } catch (error) {
          if (error instanceof InvalidTransitionError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `An order can't move from "${order.status}" to "${input.status}".`,
            });
          }
          throw error;
        }

        const effect = transitionEffect(order.status, input.status);
        const reservations = await tx
          .select()
          .from(stockReservations)
          .where(eq(stockReservations.orderId, order.id))
          .for("update");
        const active = reservations.filter((r) => r.status === "held" || r.status === "committed");

        if (effect === "commit") {
          for (const r of active) {
            await tx
              .update(stockReservations)
              .set({ status: "committed" })
              .where(and(eq(stockReservations.id, r.id), eq(stockReservations.status, "held")));
            await tx
              .update(branchStock)
              .set({
                qtyOnHand: sql`GREATEST(0, ${branchStock.qtyOnHand} - ${r.qty})`,
                reservedOnline: sql`GREATEST(0, ${branchStock.reservedOnline} - ${r.qty})`,
                updatedAt: new Date(),
              })
              .where(and(eq(branchStock.variantId, r.variantId), eq(branchStock.branchId, r.branchId)));
          }
        } else if (effect === "release" || effect === "restock") {
          for (const r of active) {
            await tx
              .update(stockReservations)
              .set({ status: "released" })
              .where(eq(stockReservations.id, r.id));
            // Held reservations were only a reservation: return the reserved
            // count. Committed reservations already left the shelf: put the
            // physical qty back (cancel-after-confirm and returns).
            const set =
              r.status === "committed"
                ? { qtyOnHand: sql`${branchStock.qtyOnHand} + ${r.qty}`, updatedAt: new Date() }
                : { reservedOnline: sql`GREATEST(0, ${branchStock.reservedOnline} - ${r.qty})`, updatedAt: new Date() };
            await tx
              .update(branchStock)
              .set(set)
              .where(and(eq(branchStock.variantId, r.variantId), eq(branchStock.branchId, r.branchId)));
          }
        }

        await tx.update(orders).set({ status: input.status, updatedAt: new Date() }).where(eq(orders.id, order.id));
        return { from: order.status, to: input.status, orderNumber: order.orderNumber, effect };
      });

      // Low-stock check happens after commit (edge-triggered, best effort).
      if (result.effect === "commit") {
        const reservations = await db.select().from(stockReservations).where(eq(stockReservations.orderId, input.id));
        for (const r of reservations.filter((x) => x.status === "committed")) {
          await maybeRaiseLowStock(r.variantId, r.branchId);
        }
      }
      await audit(ctx.user.id, "order.status_changed", "order", result.orderNumber, {
        from: result.from,
        to: result.to,
      });
      return { success: true as const, status: input.status };
    }),
});
