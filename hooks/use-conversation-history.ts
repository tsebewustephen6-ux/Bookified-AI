'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/client-api';
import { historySchema, savedSessionSchema } from '../lib/conversation-history';
import type { z } from 'zod';

export function useConversationHistory(bookId: string, request: typeof api = api) {
  const [history, setHistory] = useState<z.infer<typeof historySchema>>({ items: [], nextCursor: null });
  const [selected, setSelected] = useState<z.infer<typeof savedSessionSchema> | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [revision, setRevision] = useState(0); const generation = useRef(0);
  const load = useCallback(async (cursor?: string) => {
    const attempt = ++generation.current;
    try {
      const result = await request(`/api/books/${bookId}/sessions${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`, historySchema);
      if (attempt === generation.current) { setHistory(previous => ({ ...result, items: cursor ? [...previous.items, ...result.items] : result.items })); setError(''); }
    } catch (error) { if (attempt === generation.current) setError(error instanceof Error ? error.message : 'Could not load saved conversations.'); }
    finally { if (attempt === generation.current) setLoading(false); }
  }, [bookId, request]);
  useEffect(() => {
    const counter = generation;
    const attempt = ++counter.current;
    void request(`/api/books/${bookId}/sessions`, historySchema).then(result => {
      if (attempt === counter.current) { setHistory(result); setError(''); }
    }, failure => {
      if (attempt === counter.current) setError(failure instanceof Error ? failure.message : 'Could not load saved conversations.');
    }).finally(() => { if (attempt === counter.current) setLoading(false); });
    return () => { counter.current++; };
  }, [bookId, request]);
  const refresh = useCallback(async (cursor?: string) => { setLoading(true); setError(''); await load(cursor); }, [load]);
  async function select(id: string) {
    const attempt = ++generation.current; setLoading(true); setError('');
    try {
      const result = await request(`/api/books/${bookId}/sessions?session=${encodeURIComponent(id)}`, savedSessionSchema);
      if (attempt === generation.current) { setSelected(result); setRevision(value => value + 1); }
    } catch (error) { if (attempt === generation.current) setError(error instanceof Error ? error.message : 'Could not load this conversation.'); }
    finally { if (attempt === generation.current) setLoading(false); }
  }
  function fresh() { generation.current++; setSelected(null); setRevision(value => value + 1); setLoading(false); setError(''); }
  return { history, selected, loading, error, revision, refresh, select, fresh };
}
