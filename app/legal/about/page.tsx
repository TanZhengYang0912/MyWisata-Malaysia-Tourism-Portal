import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerTranslation } from '@/lib/i18n/server';
import { LegalArticle } from '@/components/legal/legal-article';
import { LEGAL_LAST_UPDATED } from '@/components/legal/legal-nav';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation('customer');
  const title = `${t('legal.about.title')} · ${BRAND_NAME}`;
  // The intro has two paragraphs; the first one states who runs the platform.
  const description = t('legal.about.intro').split(/\n+/)[0];
  return { title, description, openGraph: { title, description } };
}

export default async function AboutPage() {
  const { t } = await getServerTranslation('customer');
  return (
    <>
      <LegalArticle
        title={t('legal.about.title')}
        intro={t('legal.about.intro')}
        updated={t('legal.updated', { date: LEGAL_LAST_UPDATED })}
        sections={[
          { heading: t('legal.about.what.heading'), body: t('legal.about.what.body') },
          { heading: t('legal.about.company.heading'), body: t('legal.about.company.body') },
          { heading: t('legal.about.vision.heading'), body: t('legal.about.vision.body') },
          { heading: t('legal.about.contact.heading'), body: t('legal.about.contact.body') },
        ]}
      />
      <div className="mx-auto -mt-4 max-w-2xl px-4 pb-10 sm:px-6">
        <div className="flex flex-wrap gap-3">
          <Link href="/help" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {t('legal.about.helpCta')}
          </Link>
          <Link href="/customer/support" className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground">
            {t('legal.about.supportCta')}
          </Link>
        </div>
      </div>
    </>
  );
}
