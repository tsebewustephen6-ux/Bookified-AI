import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import { authConfigured } from "./env";
import { AppError } from "./errors";
import { type Plan } from "./plans";
import { auth } from "./better-auth";
import { paidEntitlement } from "./billing";

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
    return await paidEntitlement(owner);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "PROVIDER_UNAVAILABLE",
      "Your plan could not be confirmed. Please try again.",
      503,
    );
  }
}
