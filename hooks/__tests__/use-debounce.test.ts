import { describe, expect, it } from 'vitest';
import { useDebounce } from '../use-debounce';

describe('useDebounce hook contract', () => {
  it('exports useDebounce as a function', () => {
    expect(typeof useDebounce).toBe('function');
  });
});
