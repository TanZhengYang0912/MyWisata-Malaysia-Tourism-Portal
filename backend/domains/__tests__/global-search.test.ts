import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const catalogue = vi.hoisted(() => ({ activities: vi.fn(), vendors: vi.fn(), candidates: vi.fn() }));
vi.mock('../catalogue', () => ({
  searchActivities: catalogue.activities,
  getVendors: catalogue.vendors,
  findGlobalSearchCandidates: catalogue.candidates,
  STATES_MY: ['All Malaysia', 'Penang', 'Perak'],
}));
import { performGlobalSearch } from '../search';

const db = {} as SupabaseClient;
beforeEach(() => {
  vi.clearAllMocks();
  catalogue.candidates.mockResolvedValue({ productIds: ['p1'], vendorIds: ['v1'] });
});

describe('global search', () => {
  it('starts independent catalogue reads together on the same caller-scoped client', async () => {
    let finishActivities!: (value: []) => void;
    let finishVendors!: (value: []) => void;
    catalogue.activities.mockReturnValue(new Promise<[]>((resolve) => { finishActivities = resolve; }));
    catalogue.vendors.mockReturnValue(new Promise<[]>((resolve) => { finishVendors = resolve; }));
    const pending = performGlobalSearch('Penang', db);
    try {
      // Both reads start once the candidates arrive, before either finishes.
      await vi.waitFor(() => {
        expect(catalogue.activities).toHaveBeenCalledWith({ q: 'Penang' }, db, ['p1']);
        expect(catalogue.vendors).toHaveBeenCalledWith(db, ['v1']);
      });
    } finally {
      finishActivities([]);
      finishVendors?.([]);
      await pending;
    }
  });

  it('preserves case-insensitive state/outlet matches, event exclusion and five-item limits', async () => {
    const activities = Array.from({ length: 7 }, (_, id) => ({ id: `activity-${id}` }));
    const vendors = Array.from({ length: 7 }, (_, id) => ({ id: `vendor-${id}`, name: 'Other name', kind: 'shop', outlets: [{ state: 'Penang', city: null }] }));
    catalogue.activities.mockResolvedValue(activities);
    catalogue.vendors.mockResolvedValue([
      { id: 'event', name: 'Penang event', kind: 'event', outlets: [] },
      { id: 'other', name: 'Other', kind: 'shop', outlets: [] },
      ...vendors,
    ]);
    const result = await performGlobalSearch('  PENANG  ', db);
    expect(result.destinations).toEqual(['Penang']);
    expect(result.experiences).toEqual(activities.slice(0, 5));
    expect(result.vendors).toEqual(vendors.slice(0, 5));
  });

  it('only loads the candidates the database picked, with the trimmed query', async () => {
    catalogue.activities.mockResolvedValue([]);
    catalogue.vendors.mockResolvedValue([]);
    await performGlobalSearch('  Penang ', db);
    expect(catalogue.candidates).toHaveBeenCalledWith('  Penang ', db);
    expect(catalogue.activities).toHaveBeenCalledWith({ q: 'Penang' }, db, ['p1']);
  });

  it('skips the catalogue reads when the database finds no candidates', async () => {
    catalogue.candidates.mockResolvedValue({ productIds: [], vendorIds: [] });
    expect(await performGlobalSearch('zzzz', db)).toEqual({ destinations: [], experiences: [], vendors: [] });
    expect(catalogue.activities).not.toHaveBeenCalled();
    expect(catalogue.vendors).not.toHaveBeenCalled();
  });

  it('does not issue catalogue reads for an empty query', async () => {
    expect(await performGlobalSearch('  ', db)).toEqual({ destinations: [], experiences: [], vendors: [] });
    expect(catalogue.activities).not.toHaveBeenCalled();
    expect(catalogue.vendors).not.toHaveBeenCalled();
  });

  it('propagates a read failure instead of returning a successful partial result', async () => {
    catalogue.activities.mockResolvedValue([]);
    catalogue.vendors.mockRejectedValue(new Error('catalogue unavailable'));
    await expect(performGlobalSearch('Penang', db)).rejects.toThrow('catalogue unavailable');
  });
});
