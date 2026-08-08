'use client';

import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import type { VendorInviteDraft } from '@/components/vendor/vendor-invite-wizard';

type VendorInviteDetailsStepProps = {
  preview: VendorInvitePreview;
  draft: VendorInviteDraft;
  update: <Field extends keyof VendorInviteDraft>(field: Field, value: VendorInviteDraft[Field]) => void;
  onContinue: () => void;
};

const inputClass = 'mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal';

export function VendorInviteDetailsStep({ preview, draft, update, onContinue }: VendorInviteDetailsStepProps) {
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onContinue();
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <section aria-labelledby="vendor-brand-heading">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Vendor profile</p>
          <h2 id="vendor-brand-heading" className="mt-2 text-xl font-bold text-foreground">Vendor brand</h2>
          <p className="mt-2 text-sm text-muted-foreground">These details describe the Vendor application. They do not change the original recommendation.</p>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-foreground">Business name
            <input required value={draft.businessName} onChange={(event) => update('businessName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-foreground">Legal business name
            <input required value={draft.legalBusinessName} onChange={(event) => update('legalBusinessName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-foreground">Vendor description
            <textarea value={draft.description} onChange={(event) => update('description', event.target.value)} rows={4} className={inputClass} />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">Category</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {preview.categories.map((category) => (
                <label key={category.id} className={`cursor-pointer rounded-xl border p-3 text-sm font-semibold transition-colors ${category.id === draft.categoryId ? 'border-primary bg-primary/[0.06] text-primary' : 'border-border bg-background text-foreground hover:bg-secondary'}`}>
                  <input type="radio" name="category" value={category.id} checked={category.id === draft.categoryId} onChange={() => update('categoryId', category.id)} className="sr-only" />
                  {category.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      <section aria-labelledby="first-outlet-heading" className="border-t border-border pt-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Location</p>
          <h2 id="first-outlet-heading" className="mt-2 text-xl font-bold text-foreground">First outlet</h2>
          <p className="mt-2 text-sm text-muted-foreground">This is the first location for your Vendor brand.</p>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-foreground">First outlet name
            <input required value={draft.outletName} onChange={(event) => update('outletName', event.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm font-semibold text-foreground">Business address
            <textarea required value={draft.businessAddress} onChange={(event) => update('businessAddress', event.target.value)} rows={3} className={inputClass} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-foreground">Contact email
              <input required type="email" value={draft.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm font-semibold text-foreground">Business phone (optional)
              <input value={draft.contactPhone} onChange={(event) => update('contactPhone', event.target.value)} className={inputClass} />
            </label>
          </div>
        </div>
      </section>

      <button type="submit" className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Continue</button>
    </form>
  );
}
