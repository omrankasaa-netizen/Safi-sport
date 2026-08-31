import { env } from "./env";

/**
 * Thin wrapper around Resend's HTTP API. Deliberately never throws — a
 * failed email must never break checkout, admin actions, or login. Callers
 * get back {ok:false, error} and can decide whether to surface that; every
 * call site so far treats email as best-effort.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!env.resendApiKey) {
    console.warn(`[email] RESEND_API_KEY not set — skipping send to ${params.to} ("${params.subject}").`);
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.resendApiKey}`,
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[email] Resend send failed (${resp.status}) to ${params.to}: ${body}`);
      return { ok: false, error: `Resend ${resp.status}: ${body}` };
    }

    return { ok: true };
  } catch (error) {
    console.error(`[email] Resend send threw for ${params.to}:`, error);
    return { ok: false, error: error instanceof Error ? error.message : "unknown error" };
  }
}
