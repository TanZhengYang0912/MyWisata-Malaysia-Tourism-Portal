import { describe, expect, it } from 'vitest';
import { GlobalCommandPalette } from '../global-command-palette';

describe('GlobalCommandPalette contract', () => {
  it('exports GlobalCommandPalette as a function', () => {
    expect(typeof GlobalCommandPalette).toBe('function');
  });
});
