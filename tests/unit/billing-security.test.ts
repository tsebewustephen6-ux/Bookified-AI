import { describe, it, expect, vi } from "vitest";
const identity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ identity }));
import { updatePlanAction } from "../../app/subscriptions/actions";

describe("paid plan admission", () => {
  it("does not allow an authenticated browser to grant a paid tier", async () => {
    identity.mockResolvedValue("reader");
    for (const plan of ["standard", "pro"] as const) {
      await expect(updatePlanAction(plan)).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE", status: 503 });
    }
    expect(identity).toHaveBeenCalled();
  });
  it("rejects unauthenticated plan mutation", async () => {
    identity.mockRejectedValueOnce(new Error("Sign in to continue."));
    await expect(updatePlanAction("pro")).rejects.toThrow("Sign in");
  });
});
