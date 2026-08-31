import { z } from "zod";
import { desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { syncConflicts, syncRuns } from "@db/schema";
import { createRouter, staffQuery, managerQuery, ownerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";
import { getDriver, runSync } from "./integrations/rbmsoft/syncService";
import { env } from "./lib/env";

/** RBMsoft sync admin surface (SPEC §4 sync.*). */
export const syncRouter = createRouter({
  // Staff: last runs + unresolved conflict count for the dashboard dot.
  status: staffQuery.query(async () => {
    const db = getDb();
    const [runs, [{ n }]] = await Promise.all([
      db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(10),
      db.select({ n: sql<number>`count(*)` }).from(syncConflicts).where(isNull(syncConflicts.resolvedAt)),
    ]);
    return {
      driver: getDriver().name,
      syncEnabled: env.syncEnabled,
      runs,
      unresolvedConflicts: Number(n),
    };
  }),

  // Manager: manual full sync.
  triggerFullSync: managerQuery.mutation(async ({ ctx }) => {
    await audit(ctx.user.id, "sync.full_triggered", "sync_run", null, null);
    const result = await runSync("full");
    return { ok: result.status !== "error", status: result.status, runId: result.runId };
  }),

  // Owner: conflict queue + resolve (accept the physical qty).
  conflicts: ownerQuery.query(async () => {
    return getDb()
      .select()
      .from(syncConflicts)
      .where(isNull(syncConflicts.resolvedAt))
      .orderBy(desc(syncConflicts.createdAt))
      .limit(200);
  }),

  resolveConflict: ownerQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [conflict] = await db.select().from(syncConflicts).where(eq(syncConflicts.id, input.id)).limit(1);
      if (!conflict) throw new TRPCError({ code: "NOT_FOUND", message: "Conflict not found." });
      await db.update(syncConflicts).set({ resolvedAt: new Date() }).where(eq(syncConflicts.id, conflict.id));
      await audit(ctx.user.id, "sync.conflict_resolved", "sync_conflict", conflict.id, { kind: conflict.kind });
      return { success: true as const };
    }),

  // Owner: sync configuration view — secrets masked, never echoed raw.
  config: ownerQuery.query(() => ({
    driver: env.rbmsoftDriver,
    syncEnabled: env.syncEnabled,
    baseUrl: env.rbmsoftBaseUrl,
    itemsPath: env.rbmsoftItemsPath,
    stockPath: env.rbmsoftStockPath,
    salePath: env.rbmsoftSalePath,
    apiKey: env.rbmsoftApiKey ? "••••••••" : "",
    webhookSecret: env.rbmsoftWebhookSecret ? "••••••••" : "",
  })),
});
