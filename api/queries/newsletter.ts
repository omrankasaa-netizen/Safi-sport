import { getDb } from "./connection";
import { newsletterSubscribers, type NewsletterSubscriber } from "@db/schema";
import { desc, sql } from "drizzle-orm";

export function toUiSubscriber(s: NewsletterSubscriber) {
  return {
    id: String(s.id),
    email: s.email,
    language: s.language ?? "en",
    created_date: s.createdAt.toISOString(),
  };
}

/**
 * Idempotent signup: the email column is UNIQUE, so a repeat signup is a
 * no-op (`onDuplicateKeyUpdate` that changes nothing). Callers return the
 * same success shape either way — no account enumeration.
 */
export async function subscribeToNewsletter(email: string, language: string) {
  const db = getDb();
  await db
    .insert(newsletterSubscribers)
    .values({ email, language })
    .onDuplicateKeyUpdate({ set: { email: sql`values(email)` } });
  return { ok: true as const };
}

export async function listNewsletterSubscribers(limit = 200) {
  const rows = await getDb()
    .select()
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.createdAt))
    .limit(limit);
  return rows.map(toUiSubscriber);
}
