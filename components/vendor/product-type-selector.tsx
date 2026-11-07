'use client';

import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { CATEGORY_DETAILS } from '@/lib/customer/category-details';
import { canonicalCategorySlug } from '@/lib/customer/discovery-categories';

interface Props {
  categorySlug?: string | null;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function ProductTypeSelector({ categorySlug, value, onChange, disabled = false }: Props) {
  const { t } = useTranslation('vendor');
  const category = canonicalCategorySlug(categorySlug);
  const options = category && category !== 'accommodation' ? CATEGORY_DETAILS[category]?.types ?? [] : [];
  if (!options.length) return null;

  return (
    <fieldset className="rounded-xl border border-border bg-card p-4" disabled={disabled}>
      <legend className="px-1 text-sm font-semibold text-foreground">{t('taxonomy.productTypes.title')}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const id = `product-type-${option.slug}`;
          const checked = value.includes(option.slug);
          return (
            <label key={option.slug} htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted/60 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
              <Checkbox
                id={id}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(nextChecked) => onChange(nextChecked
                  ? [...value, option.slug]
                  : value.filter((slug) => slug !== option.slug))}
              />
              {t(`taxonomy.productTypes.options.${option.slug}`)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
