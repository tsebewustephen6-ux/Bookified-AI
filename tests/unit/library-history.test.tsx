// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryHistory } from '../../components/library-history';
import type { LibraryConversationItem } from '../../lib/sessions';

afterEach(cleanup);

const mockItem: LibraryConversationItem = {
  id: 'session-1',
  name: 'Discussion on Chapter 1',
  date: '2026-10-28T12:00:00.000Z',
  status: 'ended',
  durationSeconds: 300,
  preview: 'What did the author say about zirconium moths?',
  hasTranscript: true,
  book: {
    id: 'book-1',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    slug: 'the-great-gatsby-abc123',
    status: 'ready',
  },
};

describe('LibraryHistory', () => {
  it('renders conversation history referencing the book title and author', () => {
    render(<LibraryHistory initialItems={[mockItem]} initialNextCursor={null} />);

    expect(screen.getByText('All book conversations')).toBeDefined();
    expect(screen.getByText('The Great Gatsby')).toBeDefined();
    expect(screen.getByText('Discussion on Chapter 1')).toBeDefined();
    expect(screen.getByText(/What did the author say about zirconium moths/)).toBeDefined();
    expect(screen.getByText('5 min')).toBeDefined();
    expect(screen.getByText('Saved')).toBeDefined();

    const link = screen.getByRole('link', { name: /Open book/i });
    expect(link.getAttribute('href')).toBe('/books/the-great-gatsby-abc123');
  });

  it('renders empty state when there are no conversations', () => {
    render(<LibraryHistory initialItems={[]} initialNextCursor={null} />);

    expect(screen.getByText('No conversations yet')).toBeDefined();
    expect(
      screen.getByText(/Open any ready book from your bookshelf above/i)
    ).toBeDefined();
  });

  it('loads more conversations when nextCursor is available', async () => {
    const olderItem: LibraryConversationItem = {
      id: 'session-2',
      name: 'Second Conversation',
      date: '2026-10-27T10:00:00.000Z',
      status: 'ended',
      durationSeconds: 120,
      preview: 'Earlier topic',
      hasTranscript: true,
      book: {
        id: 'book-2',
        title: 'Moby Dick',
        author: 'Herman Melville',
        slug: 'moby-dick-xyz',
        status: 'ready',
      },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [olderItem],
        nextCursor: null,
      }),
    });
    global.fetch = fetchMock;

    render(
      <LibraryHistory
        initialItems={[mockItem]}
        initialNextCursor="cursor-123"
      />
    );

    const loadMoreButton = screen.getByRole('button', {
      name: /Load older conversations/i,
    });
    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(screen.getByText('Moby Dick')).toBeDefined();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/sessions?cursor=cursor-123');
  });
});
