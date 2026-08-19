import { describe, expect, it } from 'vitest';
import { overrideUpdate } from '@/components/vendor/outlet-builder-inspector';

describe('outlet block override updates', () => {
  it('sets a key when the vendor types a value', () => {
    expect(overrideUpdate(undefined, 'phone', '+60 4-261 0000')).toEqual({ phone: '+60 4-261 0000' });
  });

  it('keeps other keys when one is set', () => {
    expect(overrideUpdate({ address: 'Gurney Drive' }, 'phone', '012')).toEqual({
      address: 'Gurney Drive',
      phone: '012',
    });
  });

  it('deletes the key when the field is cleared, restoring live data', () => {
    expect(overrideUpdate({ address: 'Gurney Drive', phone: '012' }, 'phone', '')).toEqual({
      address: 'Gurney Drive',
    });
  });

  it('treats a whitespace-only value as cleared', () => {
    expect(overrideUpdate({ phone: '012' }, 'phone', '   ')).toBeUndefined();
  });

  it('returns undefined once the last override is cleared', () => {
    expect(overrideUpdate({ phone: '012' }, 'phone', '')).toBeUndefined();
  });
});
