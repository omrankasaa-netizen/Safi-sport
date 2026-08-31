import * as cookie from "cookie";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Session } from "@contracts/constants";
import { getSessionCookieOptions } from "./lib/cookies";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { signSessionToken } from "./lib/session";
import { requestEmailOtp, verifyEmailOtp } from "./queries/emailOtp";

const OTP_ERROR_MESSAGES: Record<string, string> = {
  OTP_RATE_LIMITED: "Give it a minute before requesting another code.",
  OTP_SEND_FAILED: "Couldn't send the code. Try again in a moment.",
  OTP_NOT_FOUND: "Request a new code first.",
  OTP_EXPIRED: "That code expired. Request a new one.",
  OTP_TOO_MANY_ATTEMPTS: "Too many tries. Request a new code.",
  OTP_INVALID: "That code isn't right.",
};

export const authRouter = createRouter({
  me: authedQuery.query((opts) => opts.ctx.user),

  // Email sign-in, step 1: mail a 6-digit code. Never reveals whether the
  // email has an existing account — sign-in and sign-up are the same flow.
  requestEmailOtp: publicQuery
    .input(z.object({ email: z.string().email().max(320), language: z.enum(["en", "ar"]).optional() }))
    .mutation(async ({ input }) => {
      try {
        await requestEmailOtp(input.email, input.language ?? "en");
        return { success: true };
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        throw new TRPCError({ code: "BAD_REQUEST", message: OTP_ERROR_MESSAGES[code] ?? "Couldn't send the code." });
      }
    }),

  // Email sign-in, step 2: verify the code and issue the same session
  // cookie the Kimi OAuth callback issues, so every other auth check
  // (authedQuery, staffQuery, etc.) works identically either way.
  verifyEmailOtp: publicQuery
    .input(z.object({ email: z.string().email().max(320), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const user = await verifyEmailOtp(input.email, input.code);
        const token = await signSessionToken({ unionId: user.unionId, clientId: "email" });
        const opts = getSessionCookieOptions(ctx.req.headers);
        ctx.resHeaders.append(
          "set-cookie",
          cookie.serialize(Session.cookieName, token, {
            httpOnly: opts.httpOnly,
            path: opts.path,
            sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
            secure: opts.secure,
            maxAge: Session.maxAgeMs / 1000,
          }),
        );
        return { success: true };
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        throw new TRPCError({ code: "BAD_REQUEST", message: OTP_ERROR_MESSAGES[code] ?? "Couldn't verify the code." });
      }
    }),

  logout: authedQuery.mutation(async ({ ctx }) => {
    const opts = getSessionCookieOptions(ctx.req.headers);
    ctx.resHeaders.append(
      "set-cookie",
      cookie.serialize(Session.cookieName, "", {
        httpOnly: opts.httpOnly,
        path: opts.path,
        sameSite: opts.sameSite?.toLowerCase() as "lax" | "none",
        secure: opts.secure,
        maxAge: 0,
      }),
    );
    return { success: true };
  }),
});
