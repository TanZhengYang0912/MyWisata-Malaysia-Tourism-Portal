import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth";
import { CartProvider } from "@/components/providers/cart";
import { ActionFeedbackProvider } from "@/components/providers/action-feedback";
import { AppI18nProvider } from "@/components/providers/i18n-provider";
import { getRequestLocale } from "@/lib/i18n/server";
import { loadLocaleResources } from "@/lib/i18n/resources";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"] });
const ibmPlexMono = IBM_Plex_Mono({ variable: "--font-ibm-plex-mono", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "MyWisata — Malaysia Tourism Portal",
  description: "Discover, book and share authentic Malaysian tourism experiences.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const resources = await loadLocaleResources(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fraunces.variable} ${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppI18nProvider locale={locale} resources={resources}>
          <ActionFeedbackProvider>
            <AuthProvider>
              <CartProvider>{children}</CartProvider>
            </AuthProvider>
          </ActionFeedbackProvider>
        </AppI18nProvider>
      </body>
    </html>
  );
}
