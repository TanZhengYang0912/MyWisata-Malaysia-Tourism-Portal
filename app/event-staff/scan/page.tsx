'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { RedemptionScanner } from '@/components/vendor/redemption-scanner';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Event staff scanner. The scanner reads the event context (mode, location, date) from the URL. */
export default function EventStaffScanPage() {
  const router = useRouter();
  const { t } = useTranslation('vendor');
  const [vendorId, setVendorId] = useState<string | null>(null);

  // window.location instead of useSearchParams, as RedemptionScanner does (no Suspense boundary needed).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('vendorId') ?? '';
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once after mount
    if (UUID.test(id)) setVendorId(id);
    else router.replace('/event-staff');
  }, [router]);

  return (
    <main className="w-full space-y-4 px-4 py-6">
      <Link href="/event-staff" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" /> {t('ui.eventStaff.scan.back')}
      </Link>
      {vendorId && <RedemptionScanner vendorId={vendorId} outlets={[]} />}
    </main>
  );
}
