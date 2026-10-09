import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { bearer } from 'better-auth/plugins';
import { connect } from '../../database/connection';
import { models, Book } from '../../database/models';
import { mobileHandler } from '../../lib/mobile-api';
import { POST as websiteAdmission } from '../../app/api/books/route';

type FixtureAuth = {
  handler: (request: Request) => Promise<Response>;
  api: { getSession: (options: { headers: Headers }) => Promise<{ user: { id: string; name: string; email: string } } | null> };
};
const state = vi.hoisted(() => ({ headers: new Headers(), auth: null as FixtureAuth | null }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => state.headers }));
vi.mock('../../lib/better-auth', () => ({ auth: {
  handler: (request: Request) => state.auth!.handler(request),
  api: { getSession: (options: { headers: Headers }) => state.auth!.api.getSession(options) },
} }));
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
  process.env.MOBILE_WEB_ORIGINS = 'http://localhost:8082';
  process.env.VOICE_CATALOG_JSON = JSON.stringify([{ id: 'fixture', name: 'Fixture', description: 'Test voice', provider: 'openai', voiceId: 'alloy' }]);
  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  state.auth = betterAuth({ baseURL: origin, secret: process.env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(client.db(), { client }), emailAndPassword: { enabled: true },
    plugins: [bearer({ requireSignature: true })],
  });
  await connect();
  await Promise.all(models.map((model) => model.init()));
});
afterAll(async () => { await mongoose.disconnect(); await client?.close(); await mongo?.stop(); });
describe('native signed sessions and shared backend', () => {
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
