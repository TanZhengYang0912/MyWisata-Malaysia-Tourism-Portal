'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { formatMYR } from '@/lib/i18n/format';

export interface RegistrationListing {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
  productId: string | null;
  itemKind: 'product' | 'service';
  dailyQuantity: number;
  active: boolean;
}

interface Props {
  vendorId: string;
  listings: RegistrationListing[];
  onSaved: () => Promise<void>;
}

/**
 * Daily quantity and on/off for listings on a pending or approved stall.
 * Price is fixed once submitted; changing it needs a resubmission.
 */
export function EventListingsManager({ vendorId, listings, onSaved }: Props) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(listing: RegistrationListing, patch: { dailyQuantity?: number; active?: boolean }) {
    const dailyQuantity = patch.dailyQuantity ?? listing.dailyQuantity;
    if (!Number.isInteger(dailyQuantity) || dailyQuantity < 0 || dailyQuantity > 10000) {
      showFeedback('error', t('ui.events.listing.quantityInvalid'));
      return;
    }
    setSavingId(listing.id);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/campaign-listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyQuantity, active: patch.active ?? listing.active }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t('ui.events.listing.saveError'));
      showFeedback('success', t('ui.events.listing.saved'));
      if (patch.dailyQuantity !== undefined) {
        setQuantities((prev) => {
          const next = { ...prev };
          delete next[listing.id];
          return next;
        });
      }
      await onSaved();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.events.listing.saveError'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground">{t('ui.events.listing.manageTitle')}</h3>
      <ul className="space-y-2">
        {listings.map((listing) => {
          const draft = quantities[listing.id];
          const busy = savingId === listing.id;
          return (
            <li key={listing.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-background p-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className={listing.active ? 'text-foreground' : 'text-muted-foreground line-through'}>{listing.name}</span>
                {' '}— {listing.price === 0 ? t('ui.events.listing.free') : formatMYR(listing.price)}
                {' '}<span className="text-xs text-muted-foreground">({t(`ui.events.listing.kinds.${listing.itemKind}`)})</span>
              </span>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                {t('ui.events.listing.perDay')}
                <Input
                  type="number"
                  min={0}
                  max={10000}
                  step={1}
                  value={draft ?? String(listing.dailyQuantity)}
                  onChange={(e) => setQuantities((prev) => ({ ...prev, [listing.id]: e.target.value }))}
                  className="h-8 w-20"
                  aria-label={t('ui.events.listing.perDayFor', { name: listing.name })}
                />
              </label>
              {draft !== undefined && (
                <Button type="button" size="sm" disabled={busy} onClick={() => void save(listing, { dailyQuantity: draft.trim() === '' ? Number.NaN : Number(draft) })}>
                  {t('ui.events.listing.save')}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void save(listing, { active: !listing.active })}>
                {listing.active ? t('ui.events.listing.turnOff') : t('ui.events.listing.turnOn')}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
