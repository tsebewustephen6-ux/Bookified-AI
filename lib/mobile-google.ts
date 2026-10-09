import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { auth, getAuthDb } from "./better-auth";
import { baseUrl } from "./env";
import { AppError, failure } from "./errors";
import { body, rateLimit, sameOrigin } from "./security";

type Flow = { _id: string; challenge: string; expiresAt: Date; browserHash?: string; ott?: string; failed?: boolean; startedAt?: Date; priorSessionId?: string };
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
const flows = () => getAuthDb().collection<Flow>("mobileOauthFlows");
const idSchema = z.string().uuid();
const cookieName = "bookified.mobile-google";
function cookie(request: Request) {
  return (request.headers.get("cookie") || "").split(";").map(value => value.trim()).find(value => value.startsWith(cookieName + "="))?.slice(cookieName.length + 1) || "";
}
const browserUrl = (flow: string, operation = "browser") => new URL(`/api/mobile/oauth?operation=${operation}&flow=${flow}`, baseUrl());
function page(message: string, form = "", status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bookified Google sign-in</title><body style="background:#FDFBF7;color:#2A2626;font:18px system-ui;padding:32px;max-width:480px;margin:auto"><h1>Bookified</h1><p>${message}</p>${form}</body></html>`, { status, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "same-origin",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
  } });
}
export async function mobileGoogle(request: Request, operation: "start" | "exchange") {
  if (operation === "start") {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new AppError("PROVIDER_UNAVAILABLE", "Google sign-in is not configured.", 503);
    const { challenge } = z.object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(await body(request, 1024));
    const caller = hash((request.headers.get("x-forwarded-for") || "native").split(",")[0]);
    await rateLimit(caller, "mobile-google-start", 10);
    await flows().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    const id = randomUUID();
    await flows().insertOne({ _id: id, challenge, expiresAt: new Date(Date.now() + 600000) });
    return Response.json({ flowId: id, browserUrl: browserUrl(id).toString() });
  }
  const { flowId, verifier } = z.object({ flowId: idSchema, verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) }).parse(await body(request, 1024));
  const filter = { _id: flowId, challenge: hash(verifier), expiresAt: { $gt: new Date() } };
  const flow = await flows().findOne(filter);
  if (!flow) throw new AppError("UNAUTHORIZED", "Google sign-in expired. Start again.", 401);
  await rateLimit(flowId, "mobile-google-exchange", 60);
  if (flow.failed) { await flows().deleteOne(filter); throw new AppError("VALIDATION", "Google sign-in was cancelled or declined. Try again."); }
  if (!flow.ott) return Response.json({ status: "pending" });
  const consumed = await flows().findOneAndDelete({ ...filter, ott: { $exists: true } });
  if (!consumed?.ott) throw new AppError("UNAUTHORIZED", "This Google sign-in has already been used.", 401);
  const result = await auth.api.verifyOneTimeToken({ body: { token: consumed.ott }, asResponse: true });
  const token = result.headers.get("set-auth-token");
  if (!result.ok || !token) throw new AppError("UNAUTHORIZED", "Google sign-in expired. Start again.", 401);
  const data = await result.json();
  // Cookies and one-time tokens remain in the browser/server. The PKCE holder receives its signed native session.
  return Response.json({ status: "ready", token, data: { user: data.user } });
}
export async function mobileGoogleBrowser(request: Request) {
  try {
    const url = new URL(request.url);
    const flowId = idSchema.parse(url.searchParams.get("flow"));
    const filter = { _id: flowId, expiresAt: { $gt: new Date() }, ott: { $exists: false }, failed: { $ne: true } };
    const flow = await flows().findOne(filter);
    if (!flow) return page("This sign-in expired or was already completed. Return to Bookified and start again.", "", 400);
    const operation = url.searchParams.get("operation");
    if (request.method === "GET" && operation === "browser") {
      let binding = cookie(request);
      if (!flow.browserHash) {
        binding = randomBytes(32).toString("base64url");
        const claimed = await flows().updateOne({ ...filter, browserHash: { $exists: false } }, { $set: { browserHash: hash(binding) } });
        if (!claimed.modifiedCount) return page("This sign-in is already open in another browser. Return to Bookified and start again.", "", 409);
      } else if (flow.browserHash !== hash(binding)) return page("Use the browser where this sign-in started.", "", 403);
      const response = page("Sign in to the same Google account you use on the Bookified website. After signing in, close this browser to return to the app.", `<form method="post" action="${browserUrl(flowId)}"><button style="background:#795744;color:white;border:0;border-radius:24px;padding:16px 24px;font:inherit">Continue with Google</button></form>`);
      response.headers.append("Set-Cookie", `${cookieName}=${binding}; Path=/api/mobile/oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
      return response;
    }
    if (!flow.browserHash || flow.browserHash !== hash(cookie(request))) return page("This browser cannot complete that sign-in. Return to Bookified and start again.", "", 403);
    if (request.method === "POST" && operation === "browser") {
      sameOrigin(request);
      if (flow.startedAt) return page("This Google sign-in has already started. Return to Bookified and start again if needed.", "", 409);
      const previous = await auth.api.getSession({ headers: request.headers });
      const marked = await flows().updateOne({ ...filter, startedAt: { $exists: false } }, { $set: { startedAt: new Date(), priorSessionId: previous?.session.id || "" } });
      if (!marked.modifiedCount) return page("This Google sign-in has already started.", "", 409);
      const callback = browserUrl(flowId, "finish");
      const result = await auth.handler(new Request(new URL("/api/auth/sign-in/social", baseUrl()), {
        method: "POST", headers: { "Content-Type": "application/json", Origin: baseUrl().origin, Cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ provider: "google", callbackURL: callback.toString(), errorCallbackURL: callback + "&failed=1" }),
      }));
      if (!result.ok) return page("Google sign-in could not start. Return to Bookified and try again.", "", 502);
      const data = await result.json();
      const target = new URL(data.url);
      if (target.protocol !== "https:" || target.hostname !== "accounts.google.com") throw new AppError("PROVIDER_UNAVAILABLE", "Google sign-in returned an invalid address.", 502);
      const response = new Response(null, { status: 303, headers: { Location: target.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      for (const value of result.headers.getSetCookie()) response.headers.append("Set-Cookie", value);
      return response;
    }
    if (request.method === "GET" && operation === "finish") {
      if (url.searchParams.has("failed")) {
        await flows().updateOne(filter, { $set: { failed: true } });
        return page("Google sign-in was cancelled or declined. Close this browser and try again in Bookified.");
      }
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session || !flow.startedAt || session.session.id === flow.priorSessionId || new Date(session.session.createdAt).getTime() < flow.startedAt.getTime()) return page("No completed Google sign-in was found. Return to Bookified and try again.", "", 401);
      const { token } = await auth.api.generateOneTimeToken({ headers: request.headers });
      const saved = await flows().updateOne(filter, { $set: { ott: token, expiresAt: new Date(Date.now() + 120000) } });
      if (!saved.modifiedCount) return page("This sign-in has already completed. Return to Bookified.", "", 409);
      const response = page("Google sign-in is complete. Close this browser with the X or Back button to return to Bookified. Your library will open in the app.");
      response.headers.append("Set-Cookie", `${cookieName}=; Path=/api/mobile/oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
      return response;
    }
    return page("This sign-in request is not supported.", "", 405);
  } catch (error) {
    const response = failure(error);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
