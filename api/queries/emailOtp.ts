import crypto from "node:crypto";
import { desc, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "./connection";
import { env } from "../lib/env";
import { sendEmail } from "../lib/email";
import { otpEmail } from "../lib/emailTemplates";
import { upsertUser } from "./users";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  return crypto.createHash("sha256").update(`${email}:${code}:${env.appSecret}`).digest("hex");
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/** Synthetic unionId namespace for email-OTP accounts, distinct from Kimi's
 *  unionIds and Google admin sign-in, so the same `users` table / session
 *  mechanism can be shared without any collision risk. */
export function emailUnionId(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

/**
 * Sends a 6-digit sign-in code to `email`. Enforces a 60s cooldown between
 * sends per email to prevent spamming an inbox (or Resend's quota).
 */
export async function requestEmailOtp(email: string, language: "en" | "ar" = "en") {
  const normalized = normalizeEmail(email);
  const db = getDb();

  const [last] = await db
    .select()
    .from(schema.emailOtps)
    .where(eq(schema.emailOtps.email, normalized))
    .orderBy(desc(schema.emailOtps.createdAt))
    .limit(1);

  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new Error("OTP_RATE_LIMITED");
  }

  const code = generateCode();
  await db.insert(schema.emailOtps).values({
    email: normalized,
    codeHash: hashCode(normalized, code),
    attempts: 0,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  const { subject, html, text } = otpEmail(code, language);
  const result = await sendEmail({ to: normalized, subject, html, text });
  if (!result.ok) {
    throw new Error("OTP_SEND_FAILED");
  }
}

/**
 * Verifies a code and, on success, upserts (find-or-creates) the user and
 * returns it. Callers are responsible for signing a session token from the
 * returned `unionId` — this function only validates the code.
 */
export async function verifyEmailOtp(email: string, code: string) {
  const normalized = normalizeEmail(email);
  const db = getDb();

  const [row] = await db
    .select()
    .from(schema.emailOtps)
    .where(eq(schema.emailOtps.email, normalized))
    .orderBy(desc(schema.emailOtps.createdAt))
    .limit(1);

  if (!row || row.consumedAt) {
    throw new Error("OTP_NOT_FOUND");
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new Error("OTP_EXPIRED");
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new Error("OTP_TOO_MANY_ATTEMPTS");
  }

  if (hashCode(normalized, code) !== row.codeHash) {
    await db
      .update(schema.emailOtps)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.emailOtps.id, row.id));
    throw new Error("OTP_INVALID");
  }

  await db.update(schema.emailOtps).set({ consumedAt: new Date() }).where(eq(schema.emailOtps.id, row.id));

  const unionId = emailUnionId(normalized);
  await upsertUser({ unionId, email: normalized, lastSignInAt: new Date() });

  const [user] = await db.select().from(schema.users).where(eq(schema.users.unionId, unionId)).limit(1);
  return user;
}
