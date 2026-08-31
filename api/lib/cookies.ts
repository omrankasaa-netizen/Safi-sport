import type { CookieOptions } from "hono/utils/cookie";

function isLocalhost(headers: Headers): boolean {
  const host = headers.get("host") || "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

export function getSessionCookieOptions(headers: Headers): CookieOptions {
  const localhost = isLocalhost(headers);

  return {
    httpOnly: true,
    path: "/",
    // SameSite=Lax everywhere (SPEC §7): the app is same-origin, so Lax
    // blocks cross-site POST CSRF while still allowing top-level navigations.
    sameSite: "Lax",
    secure: !localhost,
  };
}

/**
 * Short-lived OAuth CSRF nonce cookie (Google sign-in). SameSite=Lax is
 * enough here: the callback is a top-level GET navigation back from Google,
 * which Lax allows — unlike the session cookie, this one never needs to be
 * sent cross-site via fetch.
 */
export function getOAuthNonceCookieOptions(headers: Headers): CookieOptions {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: !isLocalhost(headers),
    maxAge: 10 * 60, // 10 minutes — long enough for a Google round-trip
  };
}
