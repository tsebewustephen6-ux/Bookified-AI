import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { authConfigured } from "./env";
import { AppError } from "./errors";
import { type Plan } from "./plans";
import { auth, getAuthDb } from "./better-auth";
import { ObjectId } from "mongodb";

export { auth };

export async function getSession() {
  if (!authConfigured()) return null;
  try {
    const reqHeaders = await headers();
    return await auth.api.getSession({
      headers: reqHeaders,
    });
  } catch {
    return null;
  }
}

export async function identity(): Promise<string> {
  if (!authConfigured())
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Sign-in service is not configured.",
      503,
    );
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) throw new AppError("UNAUTHORIZED", "Sign in to continue.", 401);
  return userId;
}

export async function currentOwner(): Promise<string | null> {
  await connection();
  if (!authConfigured()) return null;
  const session = await getSession();
  return session?.user?.id ?? null;
}

export async function currentUser() {
  await connection();
  if (!authConfigured()) return null;
  const session = await getSession();
  return session?.user ?? null;
}

export async function entitlement(owner: string): Promise<Plan> {
  try {
    const session = await getSession();
    if (session?.user?.id === owner) {
      const userPlan = (session.user as { plan?: string }).plan;
      if (userPlan === "pro" || userPlan === "standard" || userPlan === "free") {
        return userPlan;
      }
    }

    const db = getAuthDb();
    let query: Record<string, unknown> = { id: owner };
    if (ObjectId.isValid(owner)) {
      query = {
        $or: [{ _id: new ObjectId(owner) }, { _id: owner }, { id: owner }],
      };
    }
    const user = await db.collection("user").findOne(query);
    if (!user) return "free";
    const plan = user.plan;
    if (plan === "pro" || plan === "standard" || plan === "free") {
      return plan;
    }
    return "free";
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Your plan could not be confirmed. Please try again.",
      503,
    );
  }
}
