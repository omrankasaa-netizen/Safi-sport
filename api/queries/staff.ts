import { eq } from "drizzle-orm";
import { getDb } from "./connection";
import { auditLogs, staffRoles, users } from "@db/schema";

export function toUiStaff(s: typeof staffRoles.$inferSelect) {
  return {
    id: String(s.id),
    email: s.email,
    name: s.name,
    role: s.role,
    created_date: s.createdAt.toISOString(),
    updated_date: s.updatedAt.toISOString(),
  };
}

export async function listStaff() {
  const rows = await getDb().select().from(staffRoles).orderBy(staffRoles.createdAt);
  return rows.map(toUiStaff);
}

/** Adds or updates a staff member's role. Takes effect next time they sign in. */
export async function upsertStaff(
  data: { email: string; name?: string; role: "staff" | "manager" | "owner" },
  actorUserId: number,
  actorEmail: string,
) {
  const email = data.email.trim().toLowerCase();
  const db = getDb();

  if (email === actorEmail.trim().toLowerCase() && data.role !== "owner") {
    throw new Error("You can't lower your own role. Ask another owner to change it.");
  }

  await db
    .insert(staffRoles)
    .values({ email, name: data.name ?? null, role: data.role, addedByUserId: actorUserId })
    .onDuplicateKeyUpdate({
      set: { name: data.name ?? null, role: data.role, updatedAt: new Date() },
    });

  // If this person already has a users row (has logged in before), sync
  // their role immediately instead of waiting for their next login.
  await db.update(users).set({ role: data.role }).where(eq(users.email, email));

  await db.insert(auditLogs).values({
    actorUserId,
    action: "staff.upserted",
    entity: "staff_role",
    entityId: email,
    detail: data,
  });

  const [row] = await db.select().from(staffRoles).where(eq(staffRoles.email, email)).limit(1);
  return row ? toUiStaff(row) : null;
}

/** Revokes admin-panel access for an email and demotes their user row to 'viewer'. */
export async function removeStaff(email: string, actorUserId: number, actorEmail: string) {
  const normalized = email.trim().toLowerCase();

  if (normalized === actorEmail.trim().toLowerCase()) {
    throw new Error("You can't remove your own staff access. Ask another owner to do it.");
  }

  const db = getDb();

  await db.delete(staffRoles).where(eq(staffRoles.email, normalized));
  await db.update(users).set({ role: "viewer" }).where(eq(users.email, normalized));

  await db.insert(auditLogs).values({
    actorUserId,
    action: "staff.removed",
    entity: "staff_role",
    entityId: normalized,
    detail: null,
  });

  return { success: true };
}
