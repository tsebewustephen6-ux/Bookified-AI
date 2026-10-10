import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
const user = { id: 'synthetic-reader', name: 'Synthetic Reader', email: 'reader@fixture.example' };
const token = 'synthetic-signed-session.only-browser-fixture-2468';
const book = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'velorinth-fixture', title: 'The Velorinth Notebook', author: 'Synthetic author', personaId: 'fixture', status: 'ready', pageCount: 3, segmentCount: 1, hasCover: true };
const secondBook = { ...book, id: 'bbbbbbbbbbbbbbbbbbbbbbbb', slug: 'second-fixture', title: 'A second book with a longer title', hasCover: false };
test.beforeEach(async ({ page }) => {
  let googleChallenge = '';
  await page.route('https://bookified-beige-six.vercel.app/api/mobile/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/mobile', '');
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    let result: unknown;
    if (path === '/auth/sign-in/email' || path === '/auth/sign-up/email') {
      if (request.postDataJSON().password !== 'fixture-password-2468') {
        await route.fulfill({ status: 401, headers, json: { message: 'Invalid email or password.' } }); return;
      }
      result = { token, data: { user } };
    } else if (path === '/auth/google/start') {
      googleChallenge = request.postDataJSON().challenge;
      result = { flowId: 'c2d0a773-c92f-4997-b8e0-2c95bfc4b437', browserUrl: 'https://bookified-beige-six.vercel.app/api/mobile/oauth?operation=browser&flow=c2d0a773-c92f-4997-b8e0-2c95bfc4b437' };
    } else if (path === '/auth/google/exchange') {
      expect(createHash('sha256').update(request.postDataJSON().verifier).digest('base64url')).toBe(googleChallenge);
      result = { status: 'ready', token, data: { user } };
    } else {
      if (request.headers().authorization !== 'Bearer ' + token) { await route.fulfill({ status: 401, headers, json: { error: { message: 'Sign in to continue.' } } }); return; }
      if (path === '/account') result = { user, plan: 'free', limits: { books: 1, sessions: 5, duration: 300 }, usage: { books: 1, connected: 2, reserved: 0, resetAt: '2026-11-01T00:00:00Z' }, voices: [{ id: 'fixture', name: 'Nova', description: 'Synthetic voice catalog' }] };
      else if (path === '/books') { const query = (url.searchParams.get('q') || '').toLowerCase(); const books = [book, secondBook].filter(item => !query || (item.title + ' ' + item.author).toLowerCase().includes(query)); result = { books, total: books.length }; }
      else if (path === '/books/' + book.id + '/cover') { await route.fulfill({ headers, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="150"><rect width="100" height="150" fill="#795744"/></svg>' }); return; }
      else if (path === '/books/' + book.id) result = { book, progress: null };
      else if (path === '/books/' + book.id + '/sessions' && request.method() === 'GET') result = url.searchParams.has('session') ? { id: 'cccccccccccccccccccccccc', resumeFrom: null, messages: [{ role: 'user', text: 'Teach me the Beryl sequence' }, { role: 'assistant', text: 'The second step checks understanding.' }] } : { items: [{ id: 'cccccccccccccccccccccccc', date: '2026-10-10T12:00:00Z', status: 'ended', durationSeconds: 300, preview: 'The second step checks understanding.', hasTranscript: true }], nextCursor: null };
      else if (path === '/auth/sign-out') result = { data: { success: true } };
      else { await route.fulfill({ status: 404, headers, json: { error: { message: 'Fixture operation unavailable.' } } }); return; }
    }
    await route.fulfill({ headers, json: result });
  });
});
async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.getByPlaceholder('Email address').fill(user.email);
  await page.getByPlaceholder('Password').fill('fixture-password-2468');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your library', { exact: true })).toBeVisible();
}
for (const width of [375, 768, 1440]) test('mobile welcome has no overflow or runtime errors at ' + width, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 812 }); await page.goto('/');
  await expect(page.getByRole('link', { name: /Start your story/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('sign-in validates fields and preserves useful provider failure feedback', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Complete all fields');
  await page.getByPlaceholder('Email address').fill(user.email);
  await page.getByPlaceholder('Password').fill('wrong-fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  await expect(page.getByPlaceholder('Email address')).toHaveValue(user.email);
});
test('phone login preserves credentials through visibility and account-mode changes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/sign-in');
  await page.getByPlaceholder('Email address').fill(user.email);
  await page.getByPlaceholder('Password').fill('fixture-password-2468');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByPlaceholder('Password')).toHaveAttribute('type', 'text');
  await expect(page.getByPlaceholder('Password')).toHaveValue('fixture-password-2468');
  await page.getByRole('button', { name: 'New here? Create account', exact: true }).click();
  await expect(page.getByPlaceholder('Email address')).toHaveValue(user.email);
  await expect(page.getByPlaceholder('Password')).toHaveAttribute('type', 'password');
  await page.getByPlaceholder('Your name').fill(user.name);
  await page.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click();
  await expect(page.getByPlaceholder('Your name')).toHaveCount(0);
  await expect(page.getByPlaceholder('Password')).toHaveValue('fixture-password-2468');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByPlaceholder('Password').press('Enter');
  await expect(page.getByText('Your library', { exact: true })).toBeVisible();
});
test('login and registration remain readable across phone and tablet widths', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/sign-in');
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
    await page.screenshot({ path: `.test-data/mobile-login-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('button', { name: 'New here? Create account', exact: true }).click();
  await expect(page.getByPlaceholder('Your name')).toBeVisible();
  await page.screenshot({ path: '.test-data/mobile-register-375.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('Google button opens the first-party browser and accepts a PKCE-bound fixture session', async ({ page }) => {
  await page.addInitScript(() => { window.open = (url) => { document.body.dataset.googleBrowserUrl = String(url); return null; }; });
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByText('Your library', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.googleBrowserUrl)).toContain('/api/mobile/oauth?operation=browser');
});
test('Google waiting state shows only disabled loading without cancel or browser guidance', async ({ page }) => {
  await page.addInitScript(() => { window.open = () => null; });
  await page.route('**/api/mobile/auth/google/exchange', async route => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (route.request().method() === 'GET') { await route.fallback(); return; }
    await route.fulfill({ headers, json: { status: 'pending' } });
  });
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await page.screenshot({ path: '.test-data/mobile-google-sign-in.png' });
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByText('Finish signing in in the browser, then close it to return here.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Signing in/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel Google sign-in' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
  await page.screenshot({ path: '.test-data/mobile-google-loading.png' });
});

test('saved per-book conversation loads its transcript and can be reset without starting a call', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page); await page.getByRole('button', { name: 'Open ' + book.title }).click();
  await page.getByRole('button', { name: 'View and continue conversation' }).click();
  await expect(page.getByText('Teach me the Beryl sequence', { exact: true })).toBeVisible();
  await expect(page.getByText('Continuing a saved conversation', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Start from beginning' }).click();
  await expect(page.getByText('Teach me the Beryl sequence', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start microphone conversation' })).toBeEnabled();
});
test('native screens consume the shared API shape, search books and sign out', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Open ' + book.title })).toBeVisible();
  await page.screenshot({ path: '.test-data/mobile-library.png' });
  await page.getByPlaceholder('Search title or author').fill('absent fixture');
  await expect(page.getByText('No matches yet', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Search title or author').fill('');
  await page.getByRole('button', { name: 'Open ' + book.title }).click();
  await expect(page.getByText('Between the words', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start microphone conversation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start microphone conversation' })).toBeEnabled();
  await page.screenshot({ path: '.test-data/mobile-conversation.png', fullPage: true });
  await page.getByRole('link', { name: /, back$/ }).click();
  await page.getByRole('tab', { name: /Settings/ }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: /Start your story/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('phone book controls stay visible and a rejected admission is recoverable without a blank panel', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
  });
  let admissions = 0;
  await page.route('**/api/mobile/books/' + book.id + '/sessions', async route => {
    if (route.request().method() === 'GET') { await route.fallback(); return; }
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    admissions++;
    await route.fulfill({ status: 403, headers, json: { error: { message: 'Session quota reached. Try again after your usage resets.', code: 'QUOTA_REACHED' } } });
  });
  await signIn(page); await page.getByRole('button', { name: 'Open ' + book.title }).click();
  const start = page.getByRole('button', { name: 'Start microphone conversation' });
  await expect(start).toBeEnabled(); expect((await start.boundingBox())!.y).toBeLessThan(812);
  await expect(page.getByText('00:00 / 05:00', { exact: true })).toBeVisible();
  await start.click(); await expect(page.getByRole('alert')).toContainText('Session quota reached');
  await expect(start).toBeEnabled(); await start.click(); await expect.poll(() => admissions).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.test-data/mobile-book-controls-375.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('add-book form uses backend voices and rejects missing PDF metadata', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Add a book', exact: true }).click();
  await expect(page.getByRole('button', { name: /Nova/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Choose a cover/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to library' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin synthesis' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a PDF');
  await page.getByRole('link', { name: /, back$/ }).click();
  await expect(page.getByText('Your library', { exact: true })).toBeVisible();
});
test('library shows authenticated covers in two equal columns and keeps navigation reachable', async ({ page }) => {
  await signIn(page);
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 812 });
    const first = page.getByRole('button', { name: 'Open ' + book.title });
    const second = page.getByRole('button', { name: 'Open ' + secondBook.title });
    await expect(first.getByRole('img', { name: 'Cover of ' + book.title })).toBeVisible();
    const a = (await first.boundingBox())!; const b = (await second.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(Math.abs(a.width - b.width)).toBeLessThan(1);
    expect(b.x).toBeGreaterThan(a.x + a.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const settingsTab = page.getByRole('tab', { name: /Settings/ });
    await expect(settingsTab).toBeInViewport();
    const label = (await settingsTab.getByText('Settings', { exact: true }).boundingBox())!;
    expect(label.y + label.height).toBeLessThanOrEqual(812);
    await page.screenshot({ path: `.test-data/mobile-library-fixed-${width}.png`, fullPage: true });
  }
});
