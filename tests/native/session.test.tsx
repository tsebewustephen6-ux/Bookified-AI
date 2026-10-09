import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { z } from 'zod';
import { SessionProvider, useSession } from '../../mobile/src/lib/session';
import { MobileError } from '../../mobile/src/lib/api';

const fixture = vi.hoisted(() => ({
  store: new Map<string, string>(), request: vi.fn(),
  listeners: new Set<(state: string) => void>(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, AppState: {
  currentState: 'active', addEventListener: (_: string, handler: (state: string) => void) => {
    fixture.listeners.add(handler); return { remove: () => fixture.listeners.delete(handler) };
  },
} }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => fixture.store.get(key) || null,
  setItemAsync: async (key: string, value: string) => { fixture.store.set(key, value); },
  deleteItemAsync: async (key: string) => { fixture.store.delete(key); },
}));
vi.mock('expo-crypto', () => ({ getRandomBytesAsync: async () => new Uint8Array(32),
  digestStringAsync: async () => 'a'.repeat(43) + '=', CryptoDigestAlgorithm: { SHA256: 'sha256' }, CryptoEncoding: { BASE64: 'base64' } }));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: async () => ({ type: 'dismiss' }) }));
vi.mock('../../mobile/src/lib/api', () => ({
  API_URL: 'https://native-session.fixture.invalid',
  userSchema: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  accountSchema: z.object({ user: z.object({ id: z.string(), name: z.string(), email: z.string() }) }),
  request: (...args: unknown[]) => fixture.request(...args),
  MobileError: class extends Error { constructor(message: string, public status = 0) { super(message); } },
}));
const user = { id: 'fixture-reader', name: 'Reader', email: 'reader@fixture.invalid' };
const token = 'fixture-only-signed-session-2468';
const key = 'bookified.session.v1';
let session: ReturnType<typeof useSession>;
let root: Root | undefined;
function Probe() {
  const current = useSession();
  useEffect(() => { session = current; }, [current]);
  return <span>{current.user?.name || 'signed out'}</span>;
}
async function mount() {
  await act(async () => { root = createRoot(document.createElement('div')); root.render(<SessionProvider><Probe /></SessionProvider>); });
}
async function unmount() { await act(async () => { root?.unmount(); root = undefined; }); }
function persisted() { return JSON.parse(fixture.store.get(key)!); }
function save() { fixture.store.set(key, JSON.stringify({ version: 2, origin: 'https://native-session.fixture.invalid', token, user })); }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fixture.store.clear(); fixture.request.mockReset(); fixture.listeners.clear();
  fixture.request.mockResolvedValue({ user });
});
afterEach(async () => { await unmount(); vi.unstubAllGlobals(); });

it('upgrades an existing phone token without requiring a new login', async () => {
  fixture.store.set(key, token);
  await mount();
  expect(session.user).toEqual(user);
  expect(persisted()).toMatchObject({ version: 2, token, user });
  expect(fixture.request).toHaveBeenCalledWith('/account', token);
});
it('email login survives a provider remount and an offline cold start until sign-out', async () => {
  await mount();
  fixture.request.mockResolvedValueOnce({ token, data: { user } });
  await act(async () => session.authenticate(user.email, 'fixture-password'));
  expect(persisted()).toMatchObject({ token, user });
  await unmount();
  fixture.request.mockRejectedValue(new MobileError('Network unavailable', 0));
  await mount();
  expect(session.loading).toBe(false); expect(session.user).toEqual(user); expect(session.token).toBe(token);
  await act(async () => { await expect(session.signOut()).rejects.toThrow('Network unavailable'); });
  expect(fixture.store.has(key)).toBe(false);
  await unmount(); await mount(); expect(session.user).toBeNull();
});
it('shows the saved identity while validation waits and refreshes it afterward', async () => {
  save(); let finish!: (value: unknown) => void;
  fixture.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(); expect(session.loading).toBe(false); expect(session.user).toEqual(user);
  const refreshed = { ...user, name: 'Updated reader' };
  await act(async () => finish({ user: refreshed }));
  expect(session.user).toEqual(refreshed); expect(persisted().user).toEqual(refreshed);
});
it('keeps a saved login during service failure and revalidates on foreground', async () => {
  save(); fixture.request.mockRejectedValueOnce(new MobileError('Service unavailable', 503));
  await mount(); expect(session.user).toEqual(user); expect(fixture.store.has(key)).toBe(true);
  await act(async () => { fixture.listeners.forEach(listener => listener('active')); });
  expect(session.error).toBe(''); expect(session.user).toEqual(user);
  expect(fixture.request).toHaveBeenCalledTimes(2);
});
it('clears an authoritatively revoked login and never restores it again', async () => {
  save(); fixture.request.mockRejectedValueOnce(new MobileError('Session revoked', 401));
  await mount(); expect(session.user).toBeNull(); expect(session.token).toBeNull(); expect(fixture.store.has(key)).toBe(false);
  await unmount(); await mount(); expect(session.user).toBeNull();
});
it('a late successful validation cannot resurrect an explicitly signed-out session', async () => {
  save(); let finish!: (value: unknown) => void;
  fixture.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(); await act(async () => session.signOut());
  await act(async () => finish({ user }));
  expect(session.user).toBeNull(); expect(fixture.store.has(key)).toBe(false);
});
it('Google login also saves the profile and survives an offline remount', async () => {
  await mount();
  fixture.request.mockResolvedValueOnce({ flowId: 'c2d0a773-c92f-4997-b8e0-2c95bfc4b437', browserUrl: 'https://native-session.fixture.invalid/api/mobile/oauth?operation=browser' })
    .mockResolvedValueOnce({ status: 'ready', token, data: { user } });
  await act(async () => session.authenticateGoogle(new AbortController().signal));
  expect(persisted()).toMatchObject({ token, user }); await unmount();
  fixture.request.mockRejectedValueOnce(new MobileError('Offline', 0));
  await mount(); expect(session.user).toEqual(user);
});
it('private API connection failures preserve login but an authoritative 401 removes it', async () => {
  save(); await mount();
  fixture.request.mockRejectedValueOnce(new MobileError('Offline', 0));
  await act(async () => { await expect(session.call('/books')).rejects.toThrow('Offline'); });
  expect(session.user).toEqual(user); expect(fixture.store.has(key)).toBe(true);
  fixture.request.mockRejectedValueOnce(new MobileError('Revoked', 401));
  await act(async () => { await expect(session.call('/books')).rejects.toThrow('Revoked'); });
  expect(session.user).toBeNull(); expect(fixture.store.has(key)).toBe(false);
});
it('never sends a saved credential to a differently configured API origin', async () => {
  fixture.store.set(key, JSON.stringify({ version: 2, origin: 'https://other.fixture.invalid', token, user }));
  await mount(); expect(fixture.request).not.toHaveBeenCalled(); expect(session.user).toBeNull();
  expect(session.error).toContain('saved session'); expect(fixture.store.has(key)).toBe(true);
});
