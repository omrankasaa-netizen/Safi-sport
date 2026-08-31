import { getDb } from "./connection";
import { auditLogs, contactMessages, type ContactMessage } from "@db/schema";
import { desc, eq } from "drizzle-orm";

export function toUiContactMessage(m: ContactMessage) {
  return {
    id: String(m.id),
    name: m.name,
    email: m.email,
    phone: m.phone,
    message: m.message,
    status: m.status,
    created_date: m.createdAt.toISOString(),
  };
}

export type CreateContactMessageInput = {
  name: string;
  email: string;
  phone?: string;
  message: string;
};

export async function createContactMessage(input: CreateContactMessageInput) {
  const db = getDb();
  const [{ id }] = await db
    .insert(contactMessages)
    .values({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      message: input.message,
      status: "new",
    })
    .$returningId();

  await db.insert(auditLogs).values({
    actorUserId: null,
    action: "contact_message.created",
    entity: "contact_message",
    entityId: String(id),
    detail: { name: input.name, email: input.email },
  });

  const row = await db.query.contactMessages.findFirst({ where: eq(contactMessages.id, id) });
  return row ? toUiContactMessage(row) : null;
}

export async function listAllContactMessages(limit = 200) {
  const rows = await getDb()
    .select()
    .from(contactMessages)
    .orderBy(desc(contactMessages.createdAt))
    .limit(limit);
  return rows.map(toUiContactMessage);
}

export async function updateContactMessageStatus(
  id: number,
  status: (typeof contactMessages.status.enumValues)[number],
  actorUserId: number,
) {
  const db = getDb();
  await db
    .update(contactMessages)
    .set({ status, updatedAt: new Date() })
    .where(eq(contactMessages.id, id));
  await db.insert(auditLogs).values({
    actorUserId,
    action: "contact_message.status_updated",
    entity: "contact_message",
    entityId: String(id),
    detail: { status },
  });
  const row = await db.query.contactMessages.findFirst({ where: eq(contactMessages.id, id) });
  return row ? toUiContactMessage(row) : null;
}
