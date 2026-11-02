import { describe, it, expect } from 'vitest';
import { storageKey, loadVotes, saveVotes, toggleVote, tally } from './voteStore.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };

describe('voteStore', () => {
  it('round-trips votes through storage under a versioned key', () => {
    const s = memoryStorage();
    const key = storageKey('2026-11-02');
    expect(saveVotes(s, key, { a: 'gpt-4o-mini' })).toBe(true);
    expect(loadVotes(s, key)).toEqual({ a: 'gpt-4o-mini' });
    expect(key).toBe('unkept.pipelineDemo.votes.2026-11-02');
  });
  it('removes the key when votes are cleared', () => {
    const s = memoryStorage();
    saveVotes(s, 'k', { a: 'x' });
    saveVotes(s, 'k', {});
    expect(s._m.has('k')).toBe(false);
  });
  it('survives corrupt JSON and non-object payloads', () => {
    const s = memoryStorage();
    s.setItem('k', '{nope');
    expect(loadVotes(s, 'k')).toEqual({});
    s.setItem('k', '[1,2]');
    expect(loadVotes(s, 'k')).toEqual({});
    s.setItem('k', '{"a":"x","b":3}');
    expect(loadVotes(s, 'k')).toEqual({ a: 'x' });
  });
  it('never throws when storage is unavailable', () => {
    expect(loadVotes(throwing, 'k')).toEqual({});
    expect(saveVotes(throwing, 'k', { a: 'x' })).toBe(false);
    expect(loadVotes(undefined, 'k')).toEqual({});
  });
  it('toggles and tallies', () => {
    let v = toggleVote({}, 'a', 'A');
    v = toggleVote(v, 'b', 'B');
    v = toggleVote(v, 'c', 'A');
    expect(tally(['A', 'B'], v)).toEqual({ counts: [{ label: 'A', count: 2 }, { label: 'B', count: 1 }], total: 3 });
    v = toggleVote(v, 'a', 'A');
    expect(v).toEqual({ b: 'B', c: 'A' });
  });
});
