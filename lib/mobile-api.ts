import { auth } from "./better-auth";
import { authConfigured, baseUrl } from "./env";
import { AppError, failure } from "./errors";
import { body, rateLimit } from "./security";
import { library } from "./books";
import { entitlement } from "./auth";
import { usageSummary } from "./sessions";
import { plans } from "./plans";
import { voices } from "./voices";
import { mobileGoogle } from "./mobile-google";
import { POST as admit } from "../app/api/books/route";
import { POST as upload } from "../app/api/upload/route";
import { GET as processing } from "../app/api/books/[id]/processing/route";
import { GET as cover } from "../app/api/books/[id]/cover/route";
import { POST as confirm } from "../app/api/books/[id]/confirm/route";
import { POST as retry } from "../app/api/books/[id]/retry/route";
import { POST as start } from "../app/api/books/[id]/sessions/route";
import { GET as sessionStatus, POST as stop } from "../app/api/sessions/[id]/route";

export function mobileOriginAllowed(origin: string | null) {
  if (!origin) return true;
  try { if (origin === baseUrl().origin) return true; } catch { return false; }
  return (process.env.MOBILE_WEB_ORIGINS || "").split(",").some((value) => value.trim() === origin);
}
export async function mobileHandler(request: Request, segments: string[]) {
  const origin = request.headers.get("origin");
  const response = await dispatch(request, segments).catch(failure);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Vary", "Origin");
  if (origin && mobileOriginAllowed(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  return response;
}
async function dispatch(request: Request, segments: string[]): Promise<Response> {
  if (!mobileOriginAllowed(request.headers.get("origin")))
    throw new AppError("UNAUTHORIZED", "This mobile preview origin is not allowed.", 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (!authConfigured()) throw new AppError("PROVIDER_UNAVAILABLE", "Sign-in service is not configured.", 503);
  const path = segments.join("/");
  if (request.method === "POST" && path === "auth/google/start") return mobileGoogle(request, "start");
  if (request.method === "POST" && path === "auth/google/exchange") return mobileGoogle(request, "exchange");
  const headers = new Headers(request.headers);
  // Native requests carry a signed session token, never ambient website cookies.
  headers.delete("cookie");
  const publicAuth = request.method === "POST" && ["auth/sign-in/email", "auth/sign-up/email"].includes(path);
  let session;
  if (!publicAuth) {
    if (!/^Bearer \S{20,2048}$/i.test(headers.get("authorization") || ""))
      throw new AppError("UNAUTHORIZED", "Sign in to continue.", 401);
    session = await auth.api.getSession({ headers });
    if (!session?.user?.id) throw new AppError("UNAUTHORIZED", "Your session expired. Sign in again.", 401);
  }
  // Forward only supported first-party operations, after native authentication.
  // Existing route checks, quotas, ownership, callback and private-object rules remain in force.
  headers.set("origin", baseUrl().origin);
  if (publicAuth || (request.method === "POST" && path === "auth/sign-out")) {
    const data = await body(request, 4096);
    const result = await auth.handler(new Request(new URL("/api/" + path, baseUrl()), {
      method: "POST", headers, body: JSON.stringify(data),
    }));
    if (!result.ok) return result;
    const payload: Record<string, unknown> = await result.json();
    let token = result.headers.get("set-auth-token");
    if (!token) {
      const cookies = result.headers.get("set-cookie") || "";
      const match = cookies.match(/session_token=([^;]+)/);
      if (match) token = match[1];
    }
    if (!token && payload?.token) token = payload.token;
    
    // Only the authenticated app receives its scoped session token, not server keys.
    return Response.json({ data: payload, ...(token ? { token } : {}) });
  }
  const owner = session!.user.id;
  await rateLimit(owner, "mobile-api", 120);
  if (request.method === "GET" && path === "account") {
    const [plan, usage] = await Promise.all([entitlement(owner), usageSummary(owner)]);
    return Response.json({ user: { id: owner, name: session!.user.name, email: session!.user.email }, plan, limits: plans[plan], usage,
      voices: voices().map(({ id, name, description }) => ({ id, name, description })) });
  }
  if (request.method === "GET" && path === "books") {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || "1");
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new AppError("VALIDATION", "Invalid library page.");
    return Response.json(await library(owner, url.searchParams.get("q") || "", page));
  }
  const forwarded = new Request(request.url, { method: request.method, headers,
    ...(request.method === "POST" ? { body: JSON.stringify(await body(request, 16384)) } : {}) });
  const context = { params: Promise.resolve({ id: segments[1] || "" }) };
  if (path === "books" && request.method === "POST") return admit(forwarded);
  if (path === "upload" && request.method === "POST") {
    const payload: unknown = await forwarded.clone().json();
    if (!payload || typeof payload !== "object" || !("type" in payload) || payload.type !== "blob.generate-client-token")
      throw new AppError("VALIDATION", "Invalid mobile upload request.");
    return upload(forwarded);
  }
  if (segments[0] === "books" && /^[a-f0-9]{24}$/i.test(segments[1] || "") && segments.length <= 3) {
    if (request.method === "GET" && (segments.length === 2 || segments[2] === "processing")) return processing(forwarded, context);
    if (request.method === "GET" && segments[2] === "cover") return cover(forwarded, context);
    if (request.method === "POST" && segments[2] === "confirm") return confirm(forwarded, context);
    if (request.method === "POST" && segments[2] === "retry") return retry(forwarded, context);
    if (request.method === "POST" && segments[2] === "sessions") return start(forwarded, context);
  }
  if (segments[0] === "sessions" && /^[a-f0-9]{24}$/i.test(segments[1] || "") && segments.length === 2) {
    if (request.method === "GET") return sessionStatus(forwarded, context);
    if (request.method === "POST") return stop(forwarded, context);
  }
  throw new AppError("NOT_FOUND", "Mobile endpoint not found.", 404);
}
