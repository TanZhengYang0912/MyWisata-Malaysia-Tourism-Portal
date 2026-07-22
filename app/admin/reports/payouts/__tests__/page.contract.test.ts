import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('payout report page contract', () => {
  it('renders separate pending earnings, pending withdrawal, reserved and available totals', () => {
    expect(source).toContain('Pending earnings RM');
    expect(source).toContain('Pending withdrawal RM');
    expect(source).toContain('Reserved RM');
    expect(source).toContain('Available RM');
  });
});
