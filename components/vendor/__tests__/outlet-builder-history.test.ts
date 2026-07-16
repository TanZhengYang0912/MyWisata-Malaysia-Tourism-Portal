import { describe, expect, it } from 'vitest';
import { createHistory } from '@/components/vendor/outlet-builder-history';

describe('outlet builder history', () => {
  it('undoes and redoes a block insertion', () => {
    const history = createHistory(['hero']);
    history.commit(['hero', 'text']);

    expect(history.undo()).toEqual(['hero']);
    expect(history.redo()).toEqual(['hero', 'text']);
  });

  it('does not mutate a previous state when a new state is committed', () => {
    const initial = [{ id: 'hero' }];
    const history = createHistory(initial);
    const next = [...initial, { id: 'text' }];
    history.commit(next);

    expect(history.state).toEqual(next);
    expect(history.undo()).toEqual(initial);
  });

  it('coalesces consecutive edits from the same field into one undo step', () => {
    const history = createHistory('');
    history.commit('A', 'hero-title');
    history.commit('AB', 'hero-title');
    history.endCoalescedCommit();

    expect(history.undo()).toBe('');
  });

  it('starts a new undo step after a coalesced edit group ends', () => {
    const history = createHistory('');
    history.commit('A', 'hero-title');
    history.commit('AB', 'hero-title');
    history.endCoalescedCommit();
    history.commit('ABC', 'hero-title');

    expect(history.undo()).toBe('AB');
  });
});
