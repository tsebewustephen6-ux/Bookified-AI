'use client';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { api } from '../lib/client-api';
import { historySchema, savedSessionSchema } from '../lib/conversation-history';
import type { z } from 'zod';

type State = {
  bookId: string; history: z.infer<typeof historySchema>;
  selected: z.infer<typeof savedSessionSchema> | null;
  listing: boolean; selecting: boolean; error: string; revision: number;
};
const initial = (bookId: string): State => ({ bookId, history: { items: [], nextCursor: null }, selected: null, listing: true, selecting: false, error: '', revision: 0 });
type Update = Partial<State> | ((current: State) => Partial<State>);
export function useConversationHistory(bookId: string, request: typeof api = api) {
  const [state, update] = useReducer((current: State, patch: Update) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }), bookId, initial);
  // Refreshing the list must never cancel a transcript selection or unlock Start early.
  const listGeneration = useRef(0); const selectionGeneration = useRef(0);
  const revision = useRef(0);
  const refresh = useCallback(async (cursor?: string) => {
    const attempt = ++listGeneration.current;
    update({ listing: true, error: '' });
    try {
      const result = await request(`/api/books/${bookId}/sessions${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`, historySchema);
      if (attempt !== listGeneration.current) return;
      update(current => ({ history: cursor ? { ...result, items: [...current.history.items, ...result.items].filter((item, index, rows) => rows.findIndex(row => row.id === item.id) === index) } : result }));
    } catch (error) {
      if (attempt === listGeneration.current) update({ error: error instanceof Error ? error.message : 'Could not load saved conversations.' });
    } finally {
      if (attempt === listGeneration.current) update({ listing: false });
    }
  }, [bookId, request]);
  useEffect(() => {
    const lists = listGeneration; const selections = selectionGeneration;
    const attempt = ++lists.current; selections.current++;
    update(initial(bookId));
    void request(`/api/books/${bookId}/sessions`, historySchema).then(result => {
      if (attempt === lists.current) update({ history: result, error: '' });
    }, failure => {
      if (attempt === lists.current) update({ error: failure instanceof Error ? failure.message : 'Could not load saved conversations.' });
    }).finally(() => { if (attempt === lists.current) update({ listing: false }); });
    return () => { lists.current++; selections.current++; };
  }, [bookId, request]);
  async function select(id: string) {
    const attempt = ++selectionGeneration.current; update({ selecting: true, error: '' });
    try {
      const result = await request(`/api/books/${bookId}/sessions?session=${encodeURIComponent(id)}`, savedSessionSchema);
      if (attempt !== selectionGeneration.current) return false;
      update({ selected: result, revision: ++revision.current });
      return true;
    } catch (error) {
      if (attempt === selectionGeneration.current) update({ error: error instanceof Error ? error.message : 'Could not load this conversation.' });
      return false;
    } finally {
      if (attempt === selectionGeneration.current) update({ selecting: false });
    }
  }
  function fresh() {
    selectionGeneration.current++;
    update({ selected: null, revision: ++revision.current, selecting: false, error: '' });
  }
  const visible = state.bookId === bookId ? state : initial(bookId);
  const latest = visible.history.items.find(item => item.hasTranscript && !['active', 'reserved'].includes(item.status));
  return { ...visible, loading: visible.listing || visible.selecting, latest, refresh, select, fresh };
}
