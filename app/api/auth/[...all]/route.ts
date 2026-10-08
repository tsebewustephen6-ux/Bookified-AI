import { auth } from "@/lib/better-auth";
import { toNextJsHandler } from "better-auth/next-js";
import { authConfigured } from "@/lib/env";
import { AppError, failure } from "@/lib/errors";

const handlers = toNextJsHandler(auth.handler);
function guarded(method: keyof typeof handlers) {
  return async (request: Request) => {
    if (!authConfigured()) return failure(new AppError("PROVIDER_UNAVAILABLE", "Sign-in service is not configured.", 503));
    return handlers[method](request);
  };
}
export const GET = guarded("GET");
export const POST = guarded("POST");
export const PATCH = guarded("PATCH");
export const PUT = guarded("PUT");
export const DELETE = guarded("DELETE");
