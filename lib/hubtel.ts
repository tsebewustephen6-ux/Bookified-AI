import { z } from "zod";
import { AppError } from "./errors";
import { baseUrl, required } from "./env";

export const paidPlanSchema = z.enum(["standard", "pro"]);
export type PaidPlan = z.infer<typeof paidPlanSchema>;
export function hubtelSettings() {
  if (
    process.env.HUBTEL_PAYMENTS_ENABLED !== "true" ||
    process.env.HUBTEL_STATUS_ACCESS_CONFIRMED !== "true"
  )
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Payment checkout is not available yet.",
      503,
    );
  const merchantAccount = z
    .string()
    .regex(/^\d{1,20}$/)
    .parse(required("HUBTEL_MERCHANT_ACCOUNT"));
  const authorization =
    "Basic " +
    Buffer.from(
      required("HUBTEL_CLIENT_ID") + ":" + required("HUBTEL_CLIENT_SECRET"),
    ).toString("base64");
  const prices = {
    standard: z.coerce
      .number()
      .int()
      .min(1)
      .max(3000000)
      .parse(required("BILLING_STANDARD_AMOUNT_MINOR")),
    pro: z.coerce
      .number()
      .int()
      .min(1)
      .max(3000000)
      .parse(required("BILLING_PRO_AMOUNT_MINOR")),
  };
  if (baseUrl().protocol !== "https:")
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Payment checkout requires HTTPS.",
      503,
    );
  return { merchantAccount, authorization, prices };
}
export function paymentCatalog() {
  try {
    const config = hubtelSettings();
    return {
      available: true as const,
      currency: "GHS" as const,
      prices: config.prices,
    };
  } catch {
    return {
      available: false as const,
      currency: "GHS" as const,
      prices: null,
    };
  }
}
class HubtelError extends AppError {
  constructor(public providerStatus: number) {
    super(
      "PROVIDER_UNAVAILABLE",
      "Payment could not be confirmed. Check again shortly.",
      503,
    );
  }
}
export function definitelyRejected(error: unknown) {
  return (
    error instanceof HubtelError &&
    [400, 401, 403, 404, 422].includes(error.providerStatus)
  );
}
async function request(url: string, init?: RequestInit): Promise<unknown> {
  const config = hubtelSettings();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: config.authorization,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new HubtelError(response.status);
  return response.json();
}
export async function initiateHubtel(
  reference: string,
  plan: PaidPlan,
  amountMinor: number,
) {
  const config = hubtelSettings();
  const result = z
    .object({
      responseCode: z.literal("0000"),
      data: z.object({
        checkoutUrl: z.string().url(),
        checkoutId: z.string().min(1).max(200),
        clientReference: z.string(),
      }),
    })
    .parse(
      await request("https://payproxyapi.hubtel.com/items/initiate", {
        method: "POST",
        body: JSON.stringify({
          totalAmount: amountMinor / 100,
          description: "Bookified " + plan + " one month access",
          merchantAccountNumber: config.merchantAccount,
          clientReference: reference,
          callbackUrl: new URL(
            "/api/billing/hubtel/callback/" + reference,
            baseUrl(),
          ).href,
          returnUrl: new URL("/subscriptions?payment=" + reference, baseUrl())
            .href,
          cancellationUrl: new URL(
            "/subscriptions?payment=" + reference,
            baseUrl(),
          ).href,
        }),
      }),
    );
  const url = new URL(result.data.checkoutUrl);
  if (
    result.data.clientReference !== reference ||
    url.protocol !== "https:" ||
    !(url.hostname === "hubtel.com" || url.hostname.endsWith(".hubtel.com")) ||
    url.username ||
    url.password
  )
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Payment checkout response could not be verified.",
      503,
    );
  return result.data;
}
export async function hubtelStatus(reference: string, merchantAccount: string) {
  if (hubtelSettings().merchantAccount !== merchantAccount)
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Payment account configuration has changed. Contact support.",
      503,
    );
  const url = new URL(
    "https://api-txnstatus.hubtel.com/transactions/" +
      encodeURIComponent(merchantAccount) +
      "/status",
  );
  url.searchParams.set("clientReference", reference);
  return z
    .object({
      responseCode: z.literal("0000"),
      data: z.object({
        clientReference: z.string(),
        status: z.enum(["Paid", "Unpaid", "Refunded"]),
        amount: z.number().nonnegative(),
        currencyCode: z.string().nullish(),
        transactionId: z.string().min(1).max(200).nullish(),
        date: z.string().optional(),
      }),
    })
    .parse(await request(url.href));
}
