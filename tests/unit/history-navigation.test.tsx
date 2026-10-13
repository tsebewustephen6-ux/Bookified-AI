// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { useConversationHistory } from '../../hooks/use-conversation-history';
import type { api } from '../../lib/client-api';

afterEach(cleanup);
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const item = (id: string) => ({ id, date: '2026-10-13T12:00:00Z', status: 'ended', durationSeconds: 300, preview: 'Previous topic', hasTranscript: true });
const transcript = (id: string) => ({ id, resumeFrom: null, messages: [{ role: 'user', text: 'Explain the next step' }] });
function fixture() {
  const pending: { path: string; task: ReturnType<typeof deferred> }[] = [];
  const request: typeof api = async (path, schema) => {
    const task = deferred(); pending.push({ path, task });
    return schema.parse(await task.promise);
  };
  return { pending, request };
}
it('keeps Start locked until selection finishes even if a list refresh finishes first', async () => {
  const { pending, request } = fixture();
  const { result } = renderHook(() => useConversationHistory('book', request));
  await act(async () => pending[0].task.resolve({ items: [item('saved')], nextCursor: null }));
  let selection!: Promise<boolean>;
  act(() => { selection = result.current.select('saved'); void result.current.refresh(); });
  await act(async () => pending[2].task.resolve({ items: [item('saved')], nextCursor: null }));
  expect(result.current.loading).toBe(true);
  await act(async () => { pending[1].task.resolve(transcript('saved')); expect(await selection).toBe(true); });
  expect(result.current.selected?.id).toBe('saved'); expect(result.current.loading).toBe(false);
});
it('clears a previous book selection and ignores its late requests after navigation', async () => {
  const { pending, request } = fixture();
  const { result, rerender } = renderHook(({ book }) => useConversationHistory(book, request), { initialProps: { book: 'first' } });
  await act(async () => pending[0].task.resolve({ items: [item('saved')], nextCursor: null }));
  act(() => { void result.current.select('saved'); });
  rerender({ book: 'second' });
  expect(result.current.selected).toBeNull(); expect(result.current.history.items).toEqual([]); expect(result.current.loading).toBe(true);
  await act(async () => pending[1].task.resolve(transcript('saved')));
  expect(result.current.selected).toBeNull(); expect(result.current.loading).toBe(true);
  await act(async () => pending[2].task.resolve({ items: [], nextCursor: null }));
  expect(result.current.loading).toBe(false);
});
it('starting fresh invalidates a late transcript without deleting saved history', async () => {
  const { pending, request } = fixture();
  const { result } = renderHook(() => useConversationHistory('book', request));
  await act(async () => pending[0].task.resolve({ items: [item('saved')], nextCursor: null }));
  let selection!: Promise<boolean>;
  act(() => { selection = result.current.select('saved'); result.current.fresh(); });
  await act(async () => { pending[1].task.resolve(transcript('saved')); expect(await selection).toBe(false); });
  expect(result.current.selected).toBeNull(); expect(result.current.history.items).toHaveLength(1); expect(result.current.loading).toBe(false);
});
it('preserves the selected conversation when another selection fails and permits retry', async () => {
  const { pending, request } = fixture();
  const { result } = renderHook(() => useConversationHistory('book', request));
  await act(async () => pending[0].task.resolve({ items: [item('saved')], nextCursor: null }));
  act(() => { void result.current.select('saved'); });
  await act(async () => pending[1].task.resolve(transcript('saved')));
  let selection!: Promise<boolean>;
  act(() => { selection = result.current.select('other'); });
  await act(async () => { pending[2].task.reject(new Error('Try again')); expect(await selection).toBe(false); });
  expect(result.current.selected?.id).toBe('saved'); expect(result.current.error).toBe('Try again'); expect(result.current.loading).toBe(false);
});
it('loads older sessions without duplicates and skips unavailable calls for the latest shortcut', async () => {
  const { pending, request } = fixture();
  const { result } = renderHook(() => useConversationHistory('book', request));
  await act(async () => pending[0].task.resolve({ items: [{ ...item('active'), status: 'active' }, item('saved')], nextCursor: 'saved' }));
  expect(result.current.latest?.id).toBe('saved');
  act(() => { void result.current.refresh('saved'); });
  await act(async () => pending[1].task.resolve({ items: [item('saved'), item('older')], nextCursor: null }));
  expect(result.current.history.items.map(row => row.id)).toEqual(['active', 'saved', 'older']);
});
