// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SignInForm } from '../../components/sign-in-form';
const fixture = vi.hoisted(() => ({ social: vi.fn(), redirect: '/library' }));
vi.mock('@/lib/auth-client', () => ({ signIn: { social: fixture.social } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams({ redirect: fixture.redirect }) }));
afterEach(() => { cleanup(); fixture.social.mockReset(); fixture.redirect = '/library'; });
it('recovers from a returned Google error and allows retry', async () => {
  fixture.social.mockResolvedValue({ error: { message: 'Sign-in service unavailable' } });
  render(<SignInForm />);
  fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sign-in service unavailable'));
  expect(screen.getByRole('button', { name: 'Continue with Google' }).hasAttribute('disabled')).toBe(false);
});
it('keeps the callback inside the application', async () => {
  fixture.redirect = '//untrusted.example'; fixture.social.mockResolvedValue({ error: { message: 'Rejected' } });
  render(<SignInForm />); fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
  await waitFor(() => expect(fixture.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/library' }));
});
