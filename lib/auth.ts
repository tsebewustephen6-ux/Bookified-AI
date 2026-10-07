import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { authConfigured } from "./env";
import { AppError } from "./errors";
import { resolvePlan } from "./plans";
export async function identity() {
  if (!authConfigured())
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Sign-in service is not configured.",
      503,
    );
  const { userId } = await auth();
  if (!userId) throw new AppError("UNAUTHORIZED", "Sign in to continue.", 401);
  return userId;
}
export async function currentOwner() {
  await connection();
  return authConfigured() ? (await auth()).userId : null;
}
export async function entitlement(owner: string) {
  try {
    const client = await clerkClient();
    const subscription = await client.billing.getUserBillingSubscription(owner);
    return resolvePlan(subscription.subscriptionItems);
  } catch {
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Your plan could not be confirmed. Please try again.",
      503,
    );
  }
}
