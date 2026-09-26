import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth";
import { CartProvider } from "@/components/providers/cart";
import { ActionFeedbackProvider } from "@/components/providers/action-feedback";
import { AppDialogProvider } from "@/components/providers/app-dialog";
import { ThemeProvider } from "@/components/providers/theme";
import { FontSizeProvider, FontSizeScript } from "@/components/providers/font-size";
import { AppI18nProvider, type AppI18nResources } from "@/components/providers/i18n-provider";
import { ReferenceCurrencyProvider } from "@/components/providers/reference-currency";
import { getReferenceRate } from "@/lib/currency/rates";
import { REFERENCE_CURRENCY_COOKIE, resolveReferenceCurrency } from "@/lib/currency/reference";
import { getRequestLocale } from "@/lib/i18n/server";
import { loadLocaleResources } from "@/lib/i18n/resources";
import { RouteScrollReset } from "@/components/shared/route-scroll-reset";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"], display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ variable: "--font-ibm-plex-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  applicationName: "MyLawatan",
  title: "MyLawatan — Malaysia Tourism Portal",
  description: "Discover, book and share authentic Malaysian tourism experiences.",
  icons: {
    icon: [{ url: "/icon.png?v=2", type: "image/png" }],
    shortcut: ["/icon.png?v=2"],
    apple: ["/icon.png?v=2"],
  },
  openGraph: {
    title: "MyLawatan — Malaysia Tourism Portal",
    description: "Discover, book and share authentic Malaysian tourism experiences.",
    siteName: "MyLawatan",
    type: "website",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const cookieStore = await cookies();
  const currency = resolveReferenceCurrency(cookieStore.get(REFERENCE_CURRENCY_COOKIE)?.value);
  const referenceRate = await getReferenceRate(currency);
  const resources = await loadLocaleResources(locale);
  const englishResources = locale === "en" ? resources : await loadLocaleResources("en");
  const resourcesByLocale: AppI18nResources = {
    en: englishResources,
    [locale]: resources,
  };

  return (
    <html
      lang={locale}
      translate="no"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <FontSizeScript />
        <ThemeProvider>
          <FontSizeProvider>
            <AppI18nProvider locale={locale} resources={resourcesByLocale}>
              <AppDialogProvider>
                <ReferenceCurrencyProvider currency={currency} snapshot={referenceRate}>
                <ActionFeedbackProvider>
                  <AuthProvider>
                    <CartProvider>
                      <Suspense fallback={null}>
                        <RouteScrollReset />
                      </Suspense>
                      {children}
                    </CartProvider>
                  </AuthProvider>
                </ActionFeedbackProvider>
                </ReferenceCurrencyProvider>
              </AppDialogProvider>
            </AppI18nProvider>
          </FontSizeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
