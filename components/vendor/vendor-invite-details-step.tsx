'use client';

import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import type { VendorInviteDraft } from '@/components/vendor/vendor-invite-wizard-state';
import { useTranslation } from 'react-i18next';

type VendorInviteDetailsStepProps = {
  preview: VendorInvitePreview;
  draft: VendorInviteDraft;
  update: <Field extends keyof VendorInviteDraft>(field: Field, value: VendorInviteDraft[Field]) => void;
  onContinue: () => void;
};

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal';

export function VendorInviteDetailsStep({ preview, draft, update, onContinue }: VendorInviteDetailsStepProps) {
  const { t } = useTranslation('vendor');
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onContinue();
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <section aria-labelledby="vendor-brand-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('invite.details.vendorProfile')}</p>
          <h2 id="vendor-brand-heading" className="mt-2 text-xl font-bold text-foreground">{t('invite.details.vendorBrand')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('invite.details.vendorDescription')}</p>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-foreground">{t('invite.fields.businessName')}
            <input required value={draft.businessName} onChange={(event) => update('businessName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-foreground">{t('invite.fields.legalBusinessName')}
            <input required value={draft.legalBusinessName} onChange={(event) => update('legalBusinessName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-foreground">{t('invite.fields.vendorDescription')}
            <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} rows={4} className={inputClass} />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">{t('invite.fields.category')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {preview.categories.map((category) => (
                <label key={category.id} className={`cursor-pointer rounded-xl border p-3 text-sm font-semibold transition-colors ${category.id === draft.categoryId ? 'border-primary bg-primary/[0.06] text-primary' : 'border-border bg-background text-foreground hover:bg-secondary'}`}>
                  <input type="radio" name="category" value={category.id} checked={category.id === draft.categoryId} onChange={() => update('categoryId', category.id)} className="peer sr-only" />
                  <span className="block rounded-lg peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2">{category.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section aria-labelledby="first-outlet-heading" className="border-t border-border pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('invite.details.location')}</p>
          <h2 id="first-outlet-heading" className="mt-2 text-xl font-bold text-foreground">{t('invite.details.firstOutlet')}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t('invite.details.firstOutletDescription')}</p>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-foreground">{t('invite.fields.firstOutletName')}
            <input required value={draft.outletName} onChange={(event) => update('outletName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-foreground">{t('invite.fields.businessAddress')}
            <textarea required value={draft.businessAddress} onChange={(event) => update('businessAddress', event.target.value)} rows={3} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-foreground">{t('invite.fields.contactEmail')}
              <input required type="email" value={draft.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm font-semibold text-foreground">{t('invite.fields.businessPhoneOptional')}
              <input value={draft.contactPhone} onChange={(event) => update('contactPhone', event.target.value)} className={inputClass} />
            </label>
          </div>
        </div>
      </section>

      <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{t('invite.actions.continue')}</button>
    </form>
  );
}
