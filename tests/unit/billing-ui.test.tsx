// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Billing } from "../../components/billing";
const fixture = vi.hoisted(() => ({
  refresh: vi.fn(),
  payment: "",
  api: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: fixture.refresh, replace: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams(fixture.payment ? { payment: fixture.payment } : {}),
}));
vi.mock("@/lib/client-api", () => ({ api: fixture.api }));
afterEach(() => {
  cleanup();
  fixture.refresh.mockReset();
  fixture.api.mockReset();
  fixture.payment = "";
});
const catalog = {
  available: true as const,
  currency: "GHS" as const,
  prices: { standard: 2500, pro: 5000 },
};
it("disabled checkout offers no purchase buttons and starts no payment", () => {
  render(
    <Billing catalog={{ available: false, currency: "GHS", prices: null }} />,
  );
  expect(screen.getByRole("status").textContent).toContain("not available yet");
  expect(screen.queryByRole("button", { name: /Choose/ })).toBeNull();
  expect(fixture.api).not.toHaveBeenCalled();
});
it("a paid return URL grants nothing until server status confirms payment", async () => {
  fixture.payment = "a".repeat(32);
  fixture.api
    .mockResolvedValueOnce({ reference: fixture.payment, status: "pending" })
    .mockResolvedValueOnce({ reference: fixture.payment, status: "paid" });
  render(<Billing catalog={catalog} />);
  expect(fixture.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "not been confirmed",
    ),
  );
  expect(fixture.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Check payment status" }));
  await waitFor(() => expect(fixture.refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status").textContent).toContain("Payment confirmed");
});
it("uses a fresh retry key after definitive rejection", async () => {
  fixture.api.mockResolvedValue({
    reference: "a".repeat(32),
    status: "failed",
  });
  render(<Billing catalog={catalog} />);
  const choose = screen.getByRole("button", { name: /Choose standard/ });
  fireEvent.click(choose);
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain("try again"),
  );
  const first = JSON.parse(fixture.api.mock.calls[0][2].body).idempotencyKey;
  fireEvent.click(choose);
  await waitFor(() => expect(fixture.api).toHaveBeenCalledTimes(2));
  const second = JSON.parse(fixture.api.mock.calls[1][2].body).idempotencyKey;
  expect(second).not.toBe(first);
});
