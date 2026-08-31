import { z } from "zod";
import { createRouter, publicQuery, ownerQuery } from "./middleware";
import { getSettings, setSetting, SETTINGS_DEFAULTS, type SettingsKey } from "./queries/settings";

const keySchema = z.enum(Object.keys(SETTINGS_DEFAULTS) as [SettingsKey, ...SettingsKey[]]);

const valueSchema = z.union([z.boolean(), z.number().int().min(0), z.string().max(2000)]);

export const settingsRouter = createRouter({
  // Public: the storefront (pixel config, delivery fee, WhatsApp/IG links,
  // branch hours, SEO strings) reads from here. Nothing sensitive.
  get: publicQuery.query(() => getSettings()),

  // Owner only: settings + pixel config (SPEC §4 settings.*).
  set: ownerQuery
    .input(z.object({ key: keySchema, value: valueSchema }))
    .mutation(async ({ ctx, input }) => {
      await setSetting(input.key, input.value as never, ctx.user.id);
      return { success: true as const };
    }),
});
