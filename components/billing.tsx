"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { Button } from "./ui/button";
import type { Plan } from "@/lib/plans";
import { api } from "@/lib/client-api";
import type { paymentCatalog } from "@/lib/hubtel";
import type { BillingSummary } from "@/lib/billing";
const responseSchema = z.object({
  reference: z.string(),
  status: z.enum(["pending", "paid", "failed", "refunded"]),
  checkoutUrl: z.string().url().optional(),
  periodEnd: z.string().optional(),
});

export function Billing({
  currentPlan = "free",
  catalog,
  summary,
}: {
  currentPlan?: Plan;
  catalog: ReturnType<typeof paymentCatalog>;
  summary?: BillingSummary;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, setPending] = useState(
    summary?.pending?.reference ?? search.get("payment"),
  );
  const [checkoutUrl, setCheckoutUrl] = useState(summary?.pending?.checkoutUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [keys, setKeys] = useState(() => ({
    standard: crypto.randomUUID(),
    pro: crypto.randomUUID(),
  }));
  async function pay(plan: "standard" | "pro") {
    setBusy(true);
    setMessage("");
    try {
      const result = await api("/api/billing/checkout", responseSchema, {
        method: "POST",
        body: JSON.stringify({ plan, idempotencyKey: keys[plan] }),
      });
      setPending(result.reference);
      setCheckoutUrl(result.checkoutUrl);
      if (result.status === "failed") {
        setPending(null);
        setKeys((old) => ({ ...old, [plan]: crypto.randomUUID() }));
        setMessage("Checkout could not start. You can try again.");
      } else if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
      else
        setMessage(
          "Checkout confirmation is pending. Check payment status before trying another payment.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Checkout could not start.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!pending) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api(
        "/api/billing/payments/" + encodeURIComponent(pending),
        responseSchema,
      );
      if (result.status === "paid") {
        setPending(null);
        setCheckoutUrl(undefined);
        setKeys({ standard: crypto.randomUUID(), pro: crypto.randomUUID() });
        setMessage("Payment confirmed. Your paid access is ready.");
        router.replace("/subscriptions");
        router.refresh();
      } else if (result.status === "failed" || result.status === "refunded") {
        setPending(null);
        setCheckoutUrl(undefined);
        setKeys({ standard: crypto.randomUUID(), pro: crypto.randomUUID() });
        setMessage(
          "This payment did not provide paid access. Refresh before starting another checkout.",
        );
        router.replace("/subscriptions");
        router.refresh();
      } else
        setMessage(
          "Payment has not been confirmed. Finish checkout or check again shortly.",
        );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Payment could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" style={{ marginTop: 24, marginBottom: 35 }}>
      <h2>Payment options</h2>
      {catalog.available ? (
        <>
          <p>
            Pay with Mobile Money or a supported card through Hubtel. One month
            of access, with no automatic renewal.
          </p>
          {summary?.paidUntil ? (
            <p>
              Paid access until{" "}
              {new Date(summary.paidUntil).toLocaleDateString()}.
            </p>
          ) : null}
          {pending ? (
            <div className="usage-row">
              {checkoutUrl ? (
                <a className="text-link" href={checkoutUrl}>
                  Continue secure checkout →
                </a>
              ) : null}
              <Button disabled={busy} onClick={check}>
                {busy ? "Checking…" : "Check payment status"}
              </Button>
            </div>
          ) : (
            <div className="usage-row">
              {(["standard", "pro"] as const).map((plan) => (
                <Button
                  key={plan}
                  disabled={
                    busy || (currentPlan !== "free" && currentPlan !== plan)
                  }
                  onClick={() => pay(plan)}
                >
                  {currentPlan === plan ? "Renew" : "Choose"} {plan} ·{" "}
                  {new Intl.NumberFormat("en-GH", {
                    style: "currency",
                    currency: "GHS",
                  }).format(catalog.prices[plan] / 100)}
                </Button>
              ))}
            </div>
          )}
          {currentPlan !== "free" ? (
            <p>Renew your current plan, or choose another after it expires.</p>
          ) : null}
        </>
      ) : (
        <p role="status">
          Mobile Money and card checkout are being prepared. Payments are not
          available yet.
        </p>
      )}
      {message ? <p role="status">{message}</p> : null}
      <Button variant="ghost" onClick={() => router.refresh()}>
        Refresh confirmed plan
      </Button>
    </section>
  );
}
