import { test, expect } from '@playwright/test';
const user = { id: 'synthetic-reader', name: 'Synthetic Reader', email: 'reader@fixture.example' };
const token = 'synthetic-signed-session.only-browser-fixture-2468';
const book = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'velorinth-fixture', title: 'The Velorinth Notebook', author: 'Synthetic author', personaId: 'fixture', status: 'ready', pageCount: 3, segmentCount: 1, hasCover: false };
test.beforeEach(async ({ page }) => {
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
    } else {
      if (request.headers().authorization !== 'Bearer ' + token) { await route.fulfill({ status: 401, headers, json: { error: { message: 'Sign in to continue.' } } }); return; }
      if (path === '/account') result = { user, plan: 'free', limits: { books: 1, sessions: 5, duration: 300 }, usage: { books: 1, connected: 2, reserved: 0, resetAt: '2026-11-01T00:00:00Z' }, voices: [{ id: 'fixture', name: 'Nova', description: 'Synthetic voice catalog' }] };
      else if (path === '/books') { const books = url.searchParams.get('q') && !book.title.toLowerCase().includes(url.searchParams.get('q')!.toLowerCase()) ? [] : [book]; result = { books, total: books.length }; }
      else if (path === '/books/' + book.id) result = { book, progress: null };
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
  await expect(page.getByRole('button', { name: 'Start conversation' })).toBeVisible();
  await page.screenshot({ path: '.test-data/mobile-conversation.png', fullPage: true });
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.getByRole('tab', { name: /Settings/ }).click();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: /Start your story/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test('add-book form uses backend voices and rejects missing PDF metadata', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Add a book', exact: true }).click();
  await expect(page.getByRole('button', { name: /Nova/ })).toBeVisible();
  await page.getByRole('button', { name: 'Begin synthesis' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a PDF');
});
