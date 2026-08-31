import * as jose from "jose";
import * as cookie from "cookie";
import { env } from "./env";
import { Errors } from "@contracts/errors";
import { Session } from "@contracts/constants";
import { findUserByUnionId } from "../queries/users";

const JWT_ALG = "HS256";

export type SessionPayload = {
  unionId: string;
  clientId: string;
};

export async function signSessionToken(
  payload: SessionPayload,
): Promise<string> {
  const secret = new TextEncoder().encode(env.appSecret);
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    // 7-day expiry with sliding refresh (each verified request re-issues a
    // fresh cookie — see authenticateRequest below).
    .setExpirationTime(Math.floor((Date.now() + Session.maxAgeMs) / 1000))
    .sign(secret);
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }
  try {
    const secret = new TextEncoder().encode(env.appSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    const { unionId, clientId } = payload;
    if (!unionId || !clientId) {
      console.warn("[session] JWT payload missing required fields.");
      return null;
    }
    return { unionId: String(unionId), clientId: String(clientId) };
  } catch (error) {
    console.warn("[session] JWT verification failed:", error);
    return null;
  }
}

/** Resolves the signed-in user from the session cookie, or throws. */
export async function authenticateRequest(headers: Headers, resHeaders?: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }

  // Sliding refresh: once the token passes half its lifetime, re-issue a
  // fresh 7-day cookie so active staff never hit a hard logout wall.
  if (resHeaders) {
    try {
      const decoded = jose.decodeJwt(token);
      const expiresAtMs = (decoded.exp ?? 0) * 1000;
      if (expiresAtMs - Date.now() < Session.maxAgeMs / 2) {
        const fresh = await signSessionToken(claim);
        const host = headers.get("host") || "";
        const localhost =
          host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
        resHeaders.append(
          "set-cookie",
          cookie.serialize(Session.cookieName, fresh, {
            httpOnly: true,
            path: "/",
            sameSite: "lax",
            secure: !localhost,
            maxAge: Math.floor(Session.maxAgeMs / 1000),
          }),
        );
      }
    } catch {
      // Refresh is best-effort; a failed refresh never blocks the request.
    }
  }
  return user;
}
