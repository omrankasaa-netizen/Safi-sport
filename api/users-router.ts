import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { staffRoles, users } from "@db/schema";
import { createRouter, ownerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";
import { listStaff, removeStaff, upsertStaff } from "./queries/staff";

/**
 * Users & roles (SPEC §4 users.*) — owner only. The staff_roles email
 * directory is the source of truth; users.role syncs on next sign-in (and
 * immediately when the person already has a users row).
 */
export const usersRouter = createRouter({
  list: ownerQuery.query(async () => {
    const db = getDb();
    const [userRows, staffDirectory] = await Promise.all([
      db.select().from(users).orderBy(desc(users.lastSignInAt)).limit(500),
      listStaff(),
    ]);
    return {
      users: userRows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        lastSignInAt: u.lastSignInAt,
        createdAt: u.createdAt,
      })),
      staffDirectory,
    };
  }),

  // Invite by email → staff_roles row; takes effect when they sign in.
  inviteByEmail: ownerQuery
    .input(
      z.object({
        email: z.string().trim().email().max(320),
        name: z.string().trim().max(160).optional(),
        role: z.enum(["staff", "manager", "owner"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const row = await upsertStaff(input, ctx.user.id, ctx.user.email ?? "");
        return { success: true as const, staff: row };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message });
      }
    }),

  setRole: ownerQuery
    .input(
      z.object({
        email: z.string().trim().email().max(320),
        role: z.enum(["staff", "manager", "owner"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user.email ?? "").toLowerCase() === input.email.toLowerCase() && input.role !== "owner") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't lower your own role. Ask another owner to change it." });
      }
      try {
        const row = await upsertStaff(input, ctx.user.id, ctx.user.email ?? "");
        return { success: true as const, staff: row };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message });
      }
    }),

  deactivate: ownerQuery
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      if ((ctx.user.email ?? "").toLowerCase() === input.email.toLowerCase()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't deactivate yourself. Ask another owner to do it." });
      }
      try {
        await removeStaff(input.email, ctx.user.id, ctx.user.email ?? "");
        return { success: true as const };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: (error as Error).message });
      }
    }),

  // Directly deactivate a users row (for accounts not in staff_roles).
  deactivateUser: ownerQuery
    .input(z.object({ userId: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't deactivate yourself. Ask another owner to do it." });
      }
      const db = getDb();
      const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      await db.update(users).set({ role: "viewer", updatedAt: new Date() }).where(eq(users.id, user.id));
      if (user.email) await db.delete(staffRoles).where(eq(staffRoles.email, user.email.toLowerCase()));
      await audit(ctx.user.id, "user.deactivated", "user", user.id, { email: user.email });
      return { success: true as const };
    }),
});
