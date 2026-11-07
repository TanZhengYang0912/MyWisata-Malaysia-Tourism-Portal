import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../20261107120518_repair_tng_ewallet_destination_label.sql', import.meta.url);

describe('TNG e-wallet destination label repair migration', () => {
  it('updates only noncanonical e-wallet destination labels', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toMatch(/UPDATE public\.payout_destinations\s+SET label = 'TNG eWallet'\s+WHERE dest_type = 'ewallet'\s+AND label IS DISTINCT FROM 'TNG eWallet'/i);
    expect(sql).not.toMatch(/UPDATE public\.withdrawal_requests/i);
  });
});
