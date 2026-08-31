import { z } from "zod";
import { staffQuery, publicQuery, createRouter } from "./middleware";
import { createContactMessage, listAllContactMessages, updateContactMessageStatus } from "./queries/contact";

const contactSubmitSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().min(2).max(2000),
});

export const contactMessagesRouter = createRouter({
  /** Public: the Contact page form. */
  submit: publicQuery.input(contactSubmitSchema).mutation(async ({ input }) => {
    return createContactMessage(input);
  }),

  /** Staff: inbox for the admin Messages page — used for WhatsApp follow-up. */
  list: staffQuery.query(async () => {
    return listAllContactMessages();
  }),

  updateStatus: staffQuery
    .input(z.object({ id: z.string(), status: z.enum(["new", "read", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      return updateContactMessageStatus(Number(input.id), input.status, ctx.user.id);
    }),
});
