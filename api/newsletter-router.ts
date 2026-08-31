import { z } from "zod";
import { staffQuery, publicQuery, createRouter } from "./middleware";
import { newsletterLimiter } from "./lib/rateLimit";
import { subscribeToNewsletter, listNewsletterSubscribers } from "./queries/newsletter";

const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  language: z.enum(["en", "ar"]).default("en"),
});

export const newsletterRouter = createRouter({
  /**
   * Public: the Footer signup form. Throttled per IP, and duplicate emails
   * return the same success shape as new signups (no enumeration).
   */
  subscribe: publicQuery.input(subscribeSchema).mutation(async ({ ctx, input }) => {
    if (!newsletterLimiter.check(ctx.clientIp)) {
      // Over the limit: fake success rather than leaking the limiter state.
      return { ok: true as const };
    }
    return subscribeToNewsletter(input.email, input.language);
  }),

  /** Staff: the Newsletter section on the admin Messages page. */
  list: staffQuery.query(async () => {
    return listNewsletterSubscribers();
  }),
});
