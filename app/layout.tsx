import { Suspense } from "react";
import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth";
import { CartProvider } from "@/components/providers/cart";
import { ActionFeedbackProvider } from "@/components/providers/action-feedback";
import { ThemeProvider } from "@/components/providers/theme";
import { FontSizeProvider, FontSizeScript } from "@/components/providers/font-size";
import { AppI18nProvider, type AppI18nResources } from "@/components/providers/i18n-provider";
import { getRequestLocale } from "@/lib/i18n/server";
import { loadLocaleResources } from "@/lib/i18n/resources";
import { RouteScrollReset } from "@/components/shared/route-scroll-reset";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], display: "swap" });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"], display: "swap" });
const ibmPlexMono = IBM_Plex_Mono({ variable: "--font-ibm-plex-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "MyWisata — Malaysia Tourism Portal",
  description: "Discover, book and share authentic Malaysian tourism experiences.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
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
      suppressHydrationWarning
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <FontSizeScript />
        <ThemeProvider>
          <FontSizeProvider>
            <AppI18nProvider locale={locale} resources={resourcesByLocale}>
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
            </AppI18nProvider>
          </FontSizeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
