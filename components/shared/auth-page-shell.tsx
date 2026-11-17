import type { ReactNode } from 'react';
import { MyLawatanLogo } from '@/components/shared/mylawatan-logo';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { CustomerSiteFooter } from '@/components/customer/customer-site-footer';
import { Card, CardContent } from '@/components/ui/card';

/** The existing login page's branded presentation for secondary auth steps. */
export function AuthPageShell({ title, description, children }: { title: ReactNode; description: ReactNode; children?: ReactNode }) {
  return <div className="relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden bg-background px-4 pb-8 pt-4 text-foreground sm:px-6 sm:pt-6">
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-secondary/80 via-background/40 to-transparent" aria-hidden="true" />
    <main className="mx-auto mb-auto mt-2 w-full max-w-[490px] py-2 sm:mt-4 sm:py-4">
      {/* Same as the login page: logo on the card's left edge, language switcher on the right. */}
      <header className="mb-5 flex min-h-[60px] items-center justify-between gap-4 sm:mb-6">
        <MyLawatanLogo markSize={48} priority />
        <div className="w-28 shrink-0 sm:w-32"><LanguageSwitcher compact /></div>
      </header>
      <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <CardContent className="p-7 sm:p-9">
          <div className="mb-6 text-center sm:mb-7">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">{title}</h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>
          </div>
          {children}
        </CardContent>
      </Card>
    </main>
    <CustomerSiteFooter variant="slim" />
  </div>;
}
