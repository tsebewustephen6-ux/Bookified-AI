import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import mongoose from 'mongoose';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { bearer, oneTimeToken } from 'better-auth/plugins';
import { createHash, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { mobileGoogleBrowser } from '../../lib/mobile-google';
import { connect } from '../../database/connection';
import { models, Book } from '../../database/models';
import { mobileHandler } from '../../lib/mobile-api';
import { POST as websiteAdmission } from '../../app/api/books/route';

type FixtureAuth = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (options: { headers: Headers }) => Promise<{ user: { id: string; name: string; email: string } } | null>;
    generateOneTimeToken: (options: { headers: Headers }) => Promise<{ token: string }>;
    verifyOneTimeToken: (options: { body: { token: string }; asResponse: true }) => Promise<Response>;
  };
};
const state = vi.hoisted(() => ({ headers: new Headers(), auth: null as FixtureAuth | null, db: null as Db | null }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('../../lib/better-auth', () => ({ auth: {
  handler: (request: Request) => state.auth!.handler(request),
  api: {
    getSession: (options: { headers: Headers }) => state.auth!.api.getSession(options),
    generateOneTimeToken: (options: { headers: Headers }) => state.auth!.api.generateOneTimeToken(options),
    verifyOneTimeToken: (options: { body: { token: string }; asResponse: true }) => state.auth!.api.verifyOneTimeToken(options),
  },
}, getAuthDb: () => state.db! }));
let mongo: MongoMemoryReplSet;
let client: MongoClient;
const origin = 'https://bookified.example';
const password = 'synthetic-test-password-2468';
async function call(path: string, token?: string, data?: unknown, extra: Record<string, string> = {}) {
  const request = new Request(origin + '/api/mobile/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  state.headers = request.headers;
  return mobileHandler(request, path.split('?')[0].split('/'));
}
async function register(name: string) {
  const response = await call('auth/sign-up/email', undefined, { name, email: name + '@fixture.example', password });
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toBeNull();
  const payload = await response.json();
  expect(payload.token).toContain('.');
  return { token: String(payload.token), owner: String(payload.data.user.id), raw: String(payload.data.token) };
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongo.getUri('mobile-fixture');
  process.env.APP_BASE_URL = origin;
  process.env.BETTER_AUTH_SECRET = 'isolated-mobile-auth-secret-at-least-32-characters';
  process.env.GOOGLE_CLIENT_ID = 'synthetic-google-client';
  process.env.GOOGLE_CLIENT_SECRET = 'synthetic-google-secret';
  process.env.MOBILE_WEB_ORIGINS = 'http://localhost:8082';
  process.env.VOICE_CATALOG_JSON = JSON.stringify([{ id: 'fixture', name: 'Fixture', description: 'Test voice', provider: 'openai', voiceId: 'alloy' }]);
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  state.db = client.db();
  state.auth = betterAuth({ baseURL: origin, secret: process.env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(client.db(), { client }), emailAndPassword: { enabled: true },
    socialProviders: { google: { clientId: 'synthetic-google-client', clientSecret: 'synthetic-google-secret' } },
    plugins: [bearer({ requireSignature: true }), oneTimeToken({ disableClientRequest: true, storeToken: 'hashed', expiresIn: 2 })],
  });
  await connect();
  await Promise.all(models.map((model) => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); await client?.close(); await mongo?.stop(); });
describe('native signed sessions and shared backend', () => {
  it('routes the real OAuth callback for both new and returning Google users into the native handoff exactly once', async () => {
    const originalAuth = state.auth;
    const callbackAuth = betterAuth({ baseURL: origin, secret: process.env.BETTER_AUTH_SECRET,
      database: mongodbAdapter(client.db(), { client }), emailAndPassword: { enabled: true },
      socialProviders: { google: { clientId: 'synthetic-google-client', clientSecret: 'synthetic-google-secret' } },
      plugins: [bearer({ requireSignature: true }), oneTimeToken({ disableClientRequest: true, storeToken: 'hashed', expiresIn: 2 })],
    });
    const context = await callbackAuth.$context;
    let mocked = false;
    for (const provider of context.socialProviders) {
      if (provider.id !== 'google') continue;
      vi.spyOn(provider, 'validateAuthorizationCode').mockResolvedValue({ accessToken: 'synthetic-provider-token', scopes: ['email', 'profile', 'openid'] });
      vi.spyOn(provider, 'getUserInfo').mockResolvedValue({ user: { name: 'Google callback fixture', email: 'real-callback@fixture.example', emailVerified: true }, data: { sub: 'synthetic-google-subject', email: 'real-callback@fixture.example', email_verified: true } });
      mocked = true;
    }
    expect(mocked).toBe(true);
    state.auth = callbackAuth;
    const jar = new Map<string, string>();
    const receive = (response: Response) => { for (const value of response.headers.getSetCookie()) { const pair = value.split(';')[0]; const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); } };
    const cookies = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    try {
      let owner = '';
      for (const kind of ['new', 'returning']) {
        const verifier = randomBytes(32).toString('hex');
        const challenge = createHash('sha256').update(verifier).digest('base64url');
        const returnUrl = 'exps://owned-preview.exp.direct/--/sign-in';
        const start = await call('auth/google/start', undefined, { challenge, returnUrl });
        const { flowId, browserUrl } = await start.json();
        const opened = await mobileGoogleBrowser(new Request(browserUrl, { headers: { Cookie: cookies() } }));
        expect(opened.status, kind).toBe(303); receive(opened);
        const authorization = new URL(opened.headers.get('location')!);
        const callback = await callbackAuth.handler(new Request(origin + '/api/auth/callback/google?code=synthetic-code&state=' + authorization.searchParams.get('state'), { headers: { Cookie: cookies() } }));
        expect(callback.status, kind).toBe(302); receive(callback);
        const finish = new URL(callback.headers.get('location')!);
        expect(finish.pathname, kind).toBe('/api/mobile/oauth'); expect(finish.searchParams.get('operation')).toBe('finish'); expect(finish.searchParams.get('flow')).toBe(flowId);
        const completed = await mobileGoogleBrowser(new Request(finish, { headers: { Cookie: cookies() } }));
        expect(completed.status, kind).toBe(200); receive(completed);
        expect(completed.headers.get('location'), kind).toBeNull();
        expect(await completed.text()).toContain('Authenticated. You can return to the app.');
        const exchanged = await call('auth/google/exchange', undefined, { flowId, verifier });
        expect(exchanged.status, kind).toBe(200); const session = await exchanged.json();
        if (owner) expect(session.data.user.id).toBe(owner); else owner = session.data.user.id;
        expect((await call('account', session.token)).status).toBe(200);
        expect((await call('auth/google/exchange', undefined, { flowId, verifier })).status).toBe(401);
      }
    } finally { state.auth = originalAuth; vi.restoreAllMocks(); }
  });
  it('signs in with a real email/password session and rejects incorrect credentials', async () => {
    const registered = await register('email-login');
    await call('auth/sign-out', registered.token, {});
    const invalid = await call('auth/sign-in/email', undefined, { email: 'email-login@fixture.example', password: 'wrong-password-2468' });
    expect(invalid.status).toBe(401);
    const signedIn = await call('auth/sign-in/email', undefined, { email: 'email-login@fixture.example', password });
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get('set-cookie')).toBeNull();
    const payload = await signedIn.json();
    expect(payload.token).toContain('.');
    const account = await call('account', payload.token);
    expect(account.status).toBe(200);
    expect((await account.json()).user.id).toBe(registered.owner);
    expect((await call('account', registered.token)).status).toBe(401);
  });
  it('redirects straight to Google without an Origin/form POST and binds the handoff to a fresh browser session', async () => {
    const verifier = randomBytes(32).toString('hex');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const returnUrl = 'exps://owned-preview.exp.direct/--/sign-in';
    const started = await call('auth/google/start', undefined, { challenge, returnUrl });
    expect(started.status).toBe(200);
    const { flowId, browserUrl } = await started.json();
    expect(new URL(browserUrl).origin).toBe(origin);
    const finish = origin + '/api/mobile/oauth?operation=finish&flow=' + flowId;
    expect((await mobileGoogleBrowser(new Request(finish))).status).toBe(403);
    const oldAuth = await state.auth!.handler(new Request(origin + '/api/auth/sign-up/email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'old', email: 'google-old@fixture.example', password }) }));
    const oldCookie = oldAuth.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const browser = await mobileGoogleBrowser(new Request(browserUrl, { headers: { Cookie: oldCookie } }));
    expect(browser.status).toBe(303);
    const google = new URL(browser.headers.get('location')!);
    expect(google.hostname).toBe('accounts.google.com');
    expect(google.searchParams.get('redirect_uri')).toBe(origin + '/api/auth/callback/google');
    expect(google.searchParams.get('prompt')).toBe('select_account');
    expect(browser.headers.getSetCookie().length).toBeGreaterThan(1);
    const browserCookie = browser.headers.get('set-cookie')!.split(';')[0];
    expect(await browser.text()).toBe('');
    const pending = await call('auth/google/exchange', undefined, { flowId, verifier });
    expect(await pending.json()).toEqual({ status: 'pending' });
    expect((await call('auth/google/exchange', undefined, { flowId, verifier: randomBytes(32).toString('hex') })).status).toBe(401);
    expect((await mobileGoogleBrowser(new Request(finish))).status).toBe(403);
    expect((await mobileGoogleBrowser(new Request(finish, { headers: { Cookie: browserCookie + '; ' + oldCookie } }))).status).toBe(401);
    expect((await mobileGoogleBrowser(new Request(browserUrl, { headers: { Cookie: browserCookie } }))).status).toBe(409);
    expect((await mobileGoogleBrowser(new Request(browserUrl))).status).toBe(403);
    expect((await mobileGoogleBrowser(new Request(browserUrl, { method: 'POST', headers: { Cookie: browserCookie } }))).status).toBe(405);
    expect((await mobileGoogleBrowser(new Request(finish, { headers: { Cookie: browserCookie + '; ' + oldCookie } }))).status).toBe(401);
    // A fresh real auth session stands in for Google's callback; no provider login is fabricated.
    const fresh = await state.auth!.handler(new Request(origin + '/api/auth/sign-up/email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Google fixture', email: 'google-fresh@fixture.example', password }) }));
    const freshCookie = fresh.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    expect((await mobileGoogleBrowser(new Request(finish, { headers: { Cookie: freshCookie } }))).status).toBe(403);
    const completed = await mobileGoogleBrowser(new Request(finish, { headers: { Cookie: browserCookie + '; ' + freshCookie } }));
    expect(completed.status).toBe(200);
    expect(completed.headers.get('location')).toBeNull();
    const completedHtml = await completed.text();
    expect(completedHtml).toContain('Authenticated. You can return to the app.');
    expect(completedHtml).toContain(`<a href="${returnUrl}">Return to app</a>`);
    expect(completedHtml).not.toContain('http-equiv="refresh"');
    const nonce = completedHtml.match(/<script nonce="([A-Za-z0-9+/=]+)">/)?.[1];
    expect(nonce).toBeTruthy();
    expect(completed.headers.get('content-security-policy')).toContain(`script-src 'nonce-${nonce}'`);
    expect(completedHtml).toContain(`window.location.replace(${JSON.stringify(returnUrl)})`);
    expect(completedHtml).toContain("window.addEventListener('load'");
    expect(completedHtml).not.toMatch(/Close this browser|X or Back|session_token/);
    // A browser without the native app must keep a visible fallback document.
    // Verify the exact response's CSP allows its automatic-return script.
    const chrome = await chromium.launch();
    try {
      const tab = await chrome.newPage({ viewport: { width: 375, height: 812 } });
      await tab.addInitScript(() => {
        const schedule = window.setTimeout;
        window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
          if (delay === 250 && typeof handler === 'function') return schedule(() => {
            document.documentElement.dataset.returnAttempted = 'true'; handler(...args);
          }, delay);
          return schedule(handler, delay, ...args);
        }) as typeof window.setTimeout;
      });
      await tab.route(origin + '/completion-fixture', route => route.fulfill({ status: completed.status,
        headers: { 'content-type': completed.headers.get('content-type')!, 'content-security-policy': completed.headers.get('content-security-policy')! }, body: completedHtml }));
      await tab.goto(origin + '/completion-fixture');
      await tab.waitForFunction(() => document.documentElement.dataset.returnAttempted === 'true');
      expect(await tab.locator('body').innerText()).toContain('Authenticated. You can return to the app.');
      expect(await tab.getByRole('link', { name: 'Return to app' }).getAttribute('href')).toBe(returnUrl);
      expect(tab.url()).toBe(origin + '/completion-fixture');
      await tab.screenshot({ path: '.test-data/mobile-auth-return-375.png' });
    } finally { await chrome.close(); }
    const exchanged = await call('auth/google/exchange', undefined, { flowId, verifier });
    expect(exchanged.status).toBe(200);
    expect(exchanged.headers.get('set-cookie')).toBeNull();
    const result = await exchanged.json();
    expect(result.status).toBe('ready');
    expect(result.token).toContain('.');
    expect((await call('account', result.token)).status).toBe(200);
    expect((await call('auth/google/exchange', undefined, { flowId, verifier })).status).toBe(401);
  });
  it('rejects arbitrary or credential-bearing return redirects before creating a Google flow', async () => {
    const challenge = createHash('sha256').update(randomBytes(32)).digest('base64url');
    for (const returnUrl of ['https://evil.example', 'javascript:alert(1)', 'exps://evil.example/--/sign-in', 'exps://owned.exp.direct/--/sign-in?token=secret', 'exps://owned.exp.direct/--/sign-in#secret', 'exps://user@owned.exp.direct/--/sign-in', 'bookifiedmobile://other', 'exps://owned.exp.direct/--/sign-in%22']) {
      expect((await call('auth/google/start', undefined, { challenge, returnUrl })).status).toBe(400);
    }
    expect(await state.db!.collection('mobileOauthFlows').countDocuments({ challenge })).toBe(0);
    expect((await call('auth/google/start', undefined, { challenge, returnUrl: 'bookifiedmobile://sign-in' })).status).toBe(200);
  });
  it('expires and rejects cancelled Google handoffs without consuming another flow', async () => {
    const verifier = randomBytes(32).toString('hex');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const start = await call('auth/google/start', undefined, { challenge });
    const { flowId } = await start.json();
    await state.db!.collection('mobileOauthFlows').updateOne({ _id: flowId }, { $set: { failed: true } });
    expect((await call('auth/google/exchange', undefined, { flowId, verifier })).status).toBe(400);
    const again = await call('auth/google/start', undefined, { challenge });
    const expired = (await again.json()).flowId;
    await state.db!.collection('mobileOauthFlows').updateOne({ _id: expired }, { $set: { expiresAt: new Date(0) } });
    expect((await call('auth/google/exchange', undefined, { flowId: expired, verifier })).status).toBe(401);
  });
  it('starts once with a null mobile-browser Origin and rejects a forged completion', async () => {
    const verifier = randomBytes(32).toString('hex');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const started = await call('auth/google/start', undefined, { challenge });
    const { flowId, browserUrl } = await started.json();
    const results = await Promise.all([
      mobileGoogleBrowser(new Request(browserUrl, { headers: { Origin: 'null' } })),
      mobileGoogleBrowser(new Request(browserUrl, { headers: { Origin: 'null' } })),
    ]);
    expect(results.filter(result => result.status === 303)).toHaveLength(1);
    // The loser can read before the claim (409) or after the binding (403).
    expect([403, 409]).toContain(results.find(result => result.status !== 303)!.status);
    const redirect = results.find(result => result.status === 303)!;
    expect(new URL(redirect.headers.get('location')!).hostname).toBe('accounts.google.com');
    const finish = origin + '/api/mobile/oauth?operation=finish&flow=' + flowId;
    const rejected = await mobileGoogleBrowser(new Request(finish + '&failed=1', { headers: { Cookie: 'bookified.mobile-google=forged' } }));
    expect(rejected.status).toBe(403);
    const pending = await call('auth/google/exchange', undefined, { flowId, verifier });
    expect(await pending.json()).toEqual({ status: 'pending' });
  });
  it('rejects cookie-only, unsigned and forged bearer sessions; revoked sessions stop working', async () => {
    const user = await register('signed');
    expect((await call('account', undefined, undefined, { cookie: 'better-auth.session_token=' + user.token })).status).toBe(401);
    expect((await call('account', user.raw)).status).toBe(401);
    expect((await call('account', user.token + 'forged')).status).toBe(401);
    const response = await call('account', user.token);
    expect(response.status).toBe(200);
    const account = await response.json();
    expect(account.user.id).toBe(user.owner);
    expect(account.plan).toBe('free');
    expect(account.limits.duration).toBe(300);
    expect(JSON.stringify(account)).not.toMatch(/voiceId|privateKey|session_token/);
    expect((await call('auth/sign-out', user.token, {})).status).toBe(200);
    expect((await call('account', user.token)).status).toBe(401);
  });
  it('shares real admission, idempotency, quota and owner-scoped reads with the website', async () => {
    const a = await register('reader-a'); const b = await register('reader-b');
    const input = { title: 'Shared book', author: 'Synthetic author', personaId: 'fixture', fileSizeBytes: 1024, idempotencyKey: randomUUID() };
    const first = await call('books', a.token, input);
    expect(first.status).toBe(200);
    const admitted = await first.json();
    expect((await (await call('books', a.token, input)).json()).id).toBe(admitted.id);
    expect((await call('books', a.token, { ...input, idempotencyKey: randomUUID() })).status).toBe(403);
    expect((await call('books/' + admitted.id, b.token)).status).toBe(404);
    expect((await call('books/' + admitted.id + '/retry', b.token, {})).status).toBe(404);
    expect((await call('books/' + admitted.id + '/sessions', b.token, { idempotencyKey: randomUUID() })).status).toBe(404);
    expect((await (await call('books', b.token)).json()).books).toEqual([]);
    const own = await (await call('books', a.token)).json();
    expect(own.books[0].id).toBe(admitted.id);
    expect(own.books[0]).not.toHaveProperty('fileKey');
    expect((await call('books?page=0', a.token)).status).toBe(400);
    expect(await Book.countDocuments({ ownerId: a.owner })).toBe(1);
  });
  it('keeps cookie mutation origin checks and never accepts Blob callbacks through native auth', async () => {
    const user = await register('origins');
    const forbidden = await call('account', user.token, undefined, { origin: 'https://foreign.example' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('access-control-allow-origin')).toBeNull();
    const allowed = await call('account', user.token, undefined, { origin: 'http://localhost:8082' });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:8082');
    expect(allowed.headers.get('access-control-allow-credentials')).toBeNull();
    expect(allowed.headers.get('cache-control')).toBe('no-store');
    expect((await call('upload', user.token, { type: 'blob.upload-completed' })).status).toBe(400);
    state.headers = new Headers({ Authorization: 'Bearer ' + user.token });
    const website = await websiteAdmission(new Request(origin + '/api/books', { method: 'POST', headers: { origin: 'https://foreign.example' }, body: '{}' }));
    expect(website.status).toBe(403);
  });
});
