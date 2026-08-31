import { describe, expect, it } from "vitest";
import { createOrderSchema } from "./order-router";

const validOrder = {
  fullName: "SAFI Customer",
  phone: "+96170123456",
  fulfilment: "delivery",
  address: "Main street, building 2, floor 3",
  area: "El Mina",
  items: [{ variantId: 1, qty: 2 }],
};

describe("checkout input validation", () => {
  it("accepts a valid delivery order", () => {
    const parsed = createOrderSchema.parse(validOrder);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.fulfilment).toBe("delivery");
  });

  it("accepts a valid pickup order at a known branch", () => {
    const parsed = createOrderSchema.parse({
      fullName: "SAFI Customer",
      phone: "+96170123456",
      fulfilment: "pickup",
      pickupBranchCode: "dam",
      items: [{ variantId: 3, qty: 1 }],
    });
    expect(parsed.pickupBranchCode).toBe("dam");
  });

  it("rejects orders with no items", () => {
    expect(() => createOrderSchema.parse({ ...validOrder, items: [] })).toThrow();
  });

  it("rejects orders with bad variant ids or quantities", () => {
    expect(() =>
      createOrderSchema.parse({ ...validOrder, items: [{ variantId: -1, qty: 1 }] }),
    ).toThrow();
    expect(() =>
      createOrderSchema.parse({ ...validOrder, items: [{ variantId: 1, qty: 0 }] }),
    ).toThrow();
  });

  it("rejects orders with non-E.164 phone numbers", () => {
    for (const phone of ["70123456", "+961 70 123 456", "+0123", "+96170123456789012345"]) {
      expect(() => createOrderSchema.parse({ ...validOrder, phone })).toThrow();
    }
  });

  it("rejects unknown pickup branches", () => {
    expect(() =>
      createOrderSchema.parse({ ...validOrder, fulfilment: "pickup", pickupBranchCode: "beirut" }),
    ).toThrow();
  });

  it("accepts the honeypot field only when short (bots get fake success server-side)", () => {
    expect(createOrderSchema.parse({ ...validOrder, company: "" }).company).toBe("");
    expect(createOrderSchema.parse({ ...validOrder, company: "Bot Industries" }).company).toBe("Bot Industries");
    expect(() => createOrderSchema.parse({ ...validOrder, company: "x".repeat(201) })).toThrow();
  });
});
