import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../lib/env";
import { getSessionCookieOptions, getOAuthNonceCookieOptions } from "../lib/cookies";
import { Paths, Session } from "@contracts/constants";
import { signSessionToken } from "../lib/session";
import { upsertUser, resolveStaffRole } from "../queries/users";

type GoogleTokenResponse = {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type OAuthFlow = "staff" | "customer";

type GoogleOAuthState = {
  redirectUri: string;
  returnTo: string;
  flow: OAuthFlow;
  nonce: string;
};

/**
 * Google sign-in, two flows sharing one callback:
 *  - "staff": /admin/* access, gated by the staff allowlist
 *    (resolveStaffRole / env.adminAllowedEmails). Redirects failures back to
 *    /admin/login?error=…
 *  - "customer": storefront sign-in (checkout, profile). Any verified Google
 *    account is accepted; staff emails still resolve to their staff role,
 *    everyone else becomes role "user". Redirects to `returnTo`.
 *
 * Both flows reuse the same session cookie/JWT shape (unionId + clientId) as
 * the Kimi OAuth flow so the rest of the app (authedQuery middleware,
 * AdminGuard, findUserByUnionId) needs no changes.
 *
 * CSRF: the authorize URL is built server-side by /api/auth/google/start,
 * which mints a random nonce into a short-lived httpOnly cookie and mirrors
 * it into the OAuth state; the callback refuses to proceed unless they match.
 */

const NONCE_COOKIE = "safi_google_nonce";

function safeReturnTo(raw: unknown, fallback: string): string {
  if (
    typeof raw === "string" &&
    raw.startsWith("/") &&
    !raw.startsWith("//")
  ) {
    return raw;
  }
  return fallback;
}

async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: redirectUri,
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<GoogleTokenResponse>;
}

async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const resp = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google userinfo fetch failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<GoogleUserInfo>;
}

/**
 * GET /api/auth/google/start?flow=customer&returnTo=/checkout
 *
 * Entry point for BOTH Google flows — clients navigate here instead of
 * building the Google authorize URL themselves, because only the server can
 * mint and cookie the CSRF nonce that the callback later verifies.
 */
export function createGoogleOAuthStartHandler() {
  return async (c: Context) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      return c.json(
        { error: "Google sign-in is not configured on this server." },
        503,
      );
    }

    const flow: OAuthFlow = c.req.query("flow") === "customer" ? "customer" : "staff";
    const fallback = flow === "staff" ? "/admin/dashboard" : "/";
    const returnTo = safeReturnTo(c.req.query("returnTo"), fallback);

    const nonce = crypto.randomUUID();
    setCookie(c, NONCE_COOKIE, nonce, getOAuthNonceCookieOptions(c.req.raw.headers));

    const redirectUri = new URL(c.req.url).origin + Paths.googleOauthCallback;
    const state: GoogleOAuthState = { redirectUri, returnTo, flow, nonce };

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    url.searchParams.set("state", btoa(JSON.stringify(state)));

    return c.redirect(url.toString(), 302);
  };
}

export function createGoogleOAuthCallbackHandler() {
  return async (c: Context) => {
    if (!env.googleClientId || !env.googleClientSecret) {
      return c.json(
        { error: "Google sign-in is not configured on this server." },
        503,
      );
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.redirect("/admin/login?error=access_denied", 302);
    }
    if (!code || !state) {
      return c.json({ error: "code and state are required" }, 400);
    }

    let redirectUri = "";
    let flow: OAuthFlow = "staff"; // absent = legacy staff link
    let nonce = "";
    let returnTo = "/admin/dashboard";
    try {
      const decoded = JSON.parse(atob(state));
      if (typeof decoded.redirectUri === "string") {
        redirectUri = decoded.redirectUri;
      }
      if (decoded.flow === "customer") {
        flow = "customer";
      }
      if (typeof decoded.nonce === "string") {
        nonce = decoded.nonce;
      }
      returnTo = safeReturnTo(
        decoded.returnTo,
        flow === "staff" ? "/admin/dashboard" : "/",
      );
    } catch {
      return c.json({ error: "Invalid state" }, 400);
    }

    const fail = (reason: string) =>
      c.redirect(
        flow === "staff" ? `/admin/login?error=${reason}` : `/login?error=${reason}`,
        302,
      );

    // CSRF check: the nonce in state must match the cookie /start set. The
    // cookie is one-shot — cleared regardless of outcome.
    const cookieNonce = getCookie(c, NONCE_COOKIE);
    deleteCookie(c, NONCE_COOKIE, { path: "/" });
    if (!nonce || !cookieNonce || cookieNonce !== nonce) {
      console.warn("[google-auth] Rejected callback — nonce mismatch.");
      return fail("state_mismatch");
    }

    try {
      const tokenResp = await exchangeGoogleCode(code, redirectUri);
      const profile = await fetchGoogleUserInfo(tokenResp.access_token);

      const email = profile.email?.trim().toLowerCase();
      const resolvedRole =
        email && profile.email_verified !== false
          ? await resolveStaffRole(email, `google:${profile.sub}`)
          : undefined;

      if (flow === "staff" && !resolvedRole) {
        console.warn(
          `[google-auth] Rejected sign-in for ${email ?? "unknown email"} — not on staff allowlist.`,
        );
        return c.redirect("/admin/login?error=not_authorized", 302);
      }

      // Prefix to keep the identity space distinct from Kimi's unionId.
      const unionId = `google:${profile.sub}`;

      await upsertUser({
        unionId,
        name: profile.name ?? email,
        email,
        avatar: profile.picture,
        // Customer flow: staff keep their staff role, everyone else stays the
        // DB default ("user"). Never passed as an explicit "user" so a staff
        // member signing in via the storefront is never downgraded.
        ...(resolvedRole ? { role: resolvedRole } : {}),
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({ unionId, clientId: "google" });
      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });

      return c.redirect(returnTo, 302);
    } catch (err) {
      console.error("[google-auth] Callback failed", err);
      return fail("server_error");
    }
  };
}
