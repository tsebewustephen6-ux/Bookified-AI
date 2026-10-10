import { expect, it } from 'vitest';
import { providerTurns, resumeContext } from '../../lib/conversation-history';
import { retrievalTerms, passageScore } from '../../lib/retrieval';
import { teachingRules } from '../../lib/vapi';

it('stores only conversational provider text, not system instructions or tools', () => {
  expect(providerTurns([{ role: 'system', content: 'secret' }, { role: 'user', content: 'Explain the sequence' }, { role: 'bot', message: 'Step one' }, { role: 'tool', content: 'private tool output' }])).toEqual([{ role: 'user', text: 'Explain the sequence' }, { role: 'assistant', text: 'Step one' }]);
});
it('bounds resumed context, preserving recent chronological turns', () => {
  const turns = Array.from({ length: 90 }, (_, i) => ({ role: 'user' as const, text: String(i).padEnd(500, 'x') }));
  const resumed = resumeContext(turns); expect(resumed).toHaveLength(48);
  expect(resumed[0].text.startsWith('42')).toBe(true); expect(resumed.at(-1)?.text.startsWith('89')).toBe(true);
  expect(resumed.reduce((sum, turn) => sum + turn.text.length, 0)).toBeLessThanOrEqual(24000);
});
it('ranks multi-term topic evidence over generic repeated words without hardcoded book facts', () => {
  const terms = retrievalTerms('Can you please teach me how the straight line system steps work?');
  expect(terms).toContain('straight'); expect(terms).not.toContain('please');
  expect(passageScore('Straight line system: steps for a conversation.', terms)).toBeGreaterThan(passageScore('Steps steps steps steps.', terms));
  expect(teachingRules).toContain('illustrative'); expect(teachingRules).toContain('second one');
});
