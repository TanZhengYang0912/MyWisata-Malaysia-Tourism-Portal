import { describe, expect, it } from 'vitest';
import { dashboardFilterLabel, rankingPercent } from '../performance-ranking';

describe('performance ranking helpers', () => {
  it('returns a readable label for each dashboard period', () => {
    expect(dashboardFilterLabel('7d')).toBe('Last 7 days');
    expect(dashboardFilterLabel('12m')).toBe('Last 12 months');
    expect(dashboardFilterLabel('custom')).toBe('Custom range');
  });

  it('scales a ranked value against the leader without exceeding the track', () => {
    expect(rankingPercent(4, 4)).toBe(100);
    expect(rankingPercent(2, 4)).toBe(50);
    expect(rankingPercent(0, 0)).toBe(8);
    expect(rankingPercent(9, 4)).toBe(100);
  });
});
