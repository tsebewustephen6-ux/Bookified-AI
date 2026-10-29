// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteShell } from '../../components/site-shell';

let mockPath = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn(),
}));

afterEach(() => {
  cleanup();
  mockPath = '/';
});

describe('SiteShell', () => {
  it('omits header and footer on /sign-in', () => {
    mockPath = '/sign-in';
    const { container } = render(
      <SiteShell user={null} configured={true}>
        <div data-testid="auth-content">Sign in page</div>
      </SiteShell>
    );

    expect(screen.getByTestId('auth-content')).toBeDefined();
    expect(container.querySelector('.site-header')).toBeNull();
    expect(container.querySelector('.site-footer')).toBeNull();
    expect(container.querySelector('.skip-link')).toBeNull();
    expect(container.querySelector('.auth-main-wrap')).toBeDefined();
  });

  it('omits header and footer on /sign-up', () => {
    mockPath = '/sign-up';
    const { container } = render(
      <SiteShell user={null} configured={true}>
        <div data-testid="auth-content">Sign up page</div>
      </SiteShell>
    );

    expect(screen.getByTestId('auth-content')).toBeDefined();
    expect(container.querySelector('.site-header')).toBeNull();
    expect(container.querySelector('.site-footer')).toBeNull();
    expect(container.querySelector('.skip-link')).toBeNull();
    expect(container.querySelector('.auth-main-wrap')).toBeDefined();
  });

  it('renders header, skip link, and footer on standard pages', () => {
    mockPath = '/';
    const { container } = render(
      <SiteShell user={null} configured={true}>
        <div data-testid="page-content">Home page</div>
      </SiteShell>
    );

    expect(screen.getByTestId('page-content')).toBeDefined();
    expect(container.querySelector('.site-header')).not.toBeNull();
    expect(container.querySelector('.site-footer')).not.toBeNull();
    expect(container.querySelector('.skip-link')).not.toBeNull();
    expect(container.querySelector('.main-wrap')).not.toBeNull();
  });
});
