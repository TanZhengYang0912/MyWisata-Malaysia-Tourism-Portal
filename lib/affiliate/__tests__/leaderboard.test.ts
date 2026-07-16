import { describe, expect, it } from 'vitest';
import { rankByCommission } from '../leaderboard';

const links = [
  { id: 'link-a', user_id: 'user-a', affiliate_code: 'AF-AAAAAA' },
  { id: 'link-b', user_id: 'user-b', affiliate_code: 'AF-BBBBBB' },
  { id: 'link-c', user_id: 'user-c', affiliate_code: 'AF-CCCCCC' },
];
const clickToLink = new Map([
  ['click-1', 'link-a'],
  ['click-2', 'link-b'],
  ['click-3', 'link-a'],
]);

describe('rankByCommission', () => {
  it('sorts links by non-reversed commission, descending', () => {
    const attributions = [
      { click_id: 'click-1', commission_amount: 10, status: 'pending' },
      { click_id: 'click-2', commission_amount: 25, status: 'confirmed' },
      { click_id: 'click-3', commission_amount: 5, status: 'confirmed' },
    ];
    const ranked = rankByCommission(links, attributions, clickToLink);
    expect(ranked.map((r) => r.linkId)).toEqual(['link-b', 'link-a', 'link-c']);
    expect(ranked[0].commission).toBe(25);
    expect(ranked[1].commission).toBe(15); // link-a: 10 + 5
    expect(ranked[2].commission).toBe(0); // link-c: no attributions
  });

  it('excludes reversed attributions from the ranking', () => {
    const attributions = [
      { click_id: 'click-1', commission_amount: 100, status: 'reversed' },
      { click_id: 'click-2', commission_amount: 5, status: 'confirmed' },
    ];
    const ranked = rankByCommission(links, attributions, clickToLink);
    const linkA = ranked.find((r) => r.linkId === 'link-a')!;
    expect(linkA.commission).toBe(0);
  });

  it('includes pending, not just confirmed — matches the admin totals label', () => {
    const attributions = [{ click_id: 'click-1', commission_amount: 7, status: 'pending' }];
    const ranked = rankByCommission(links, attributions, clickToLink);
    expect(ranked.find((r) => r.linkId === 'link-a')!.commission).toBe(7);
  });
});
