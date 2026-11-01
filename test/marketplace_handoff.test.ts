import { describe, expect, it } from "vitest";
import { MarketplaceSession, automationRequestSchema } from "../src/marketplace_handoff.js";

const paidOrder = automationRequestSchema.parse({
  requestId: "lesson-release-1042",
  instruction: "Hand off the TypeScript course to its paid learner.",
  sellerAssets: [{
    sellerId: "teacher-7",
    courseId: "ts-foundations",
    title: "TypeScript Foundations",
    summary: "Six practical lessons on types and narrowing.",
  }],
  buyerUpdates: [{
    buyerId: "learner-12",
    orderId: "order-1042",
    kind: "payment_confirmed",
    message: "Payment received; learner is ready for access.",
  }],
  orders: [{
    orderId: "order-1042",
    buyerId: "learner-12",
    courseId: "ts-foundations",
    status: "paid",
  }],
});

describe("course order handoff", () => {
  it("hands off an asset-backed paid order once", () => {
    const session = new MarketplaceSession(paidOrder);
    const args = JSON.stringify({
      orderId: "order-1042",
      buyerId: "learner-12",
      courseId: "ts-foundations",
    });

    expect(session.execute("handoff_order", args)).toEqual({
      action: "order_handed_off",
      orderId: "order-1042",
      buyerId: "learner-12",
      courseTitle: "TypeScript Foundations",
    });
    expect(session.execute("handoff_order", args).action).toBe("already_applied");
    expect(session.state.orders[0]?.status).toBe("handed_off");
  });

  it("keeps a paid order pending until its course asset is present", () => {
    const session = new MarketplaceSession({ ...paidOrder, sellerAssets: [] });
    expect(() => session.execute("handoff_order", JSON.stringify({
      orderId: "order-1042",
      buyerId: "learner-12",
      courseId: "ts-foundations",
    }))).toThrow("Order handoff requires");
    expect(session.state.orders[0]?.status).toBe("paid");
  });
});
