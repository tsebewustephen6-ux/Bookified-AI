"use server";
import { identity } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import type { Plan } from "@/lib/plans";

// Paid entitlements must come from verified billing, never a browser-selected tier.
export async function updatePlanAction(_newPlan: Plan) {
  void _newPlan;
  await identity();
  throw new AppError("PROVIDER_UNAVAILABLE", "Paid subscriptions are not configured. Your plan has not changed.", 503);
}
