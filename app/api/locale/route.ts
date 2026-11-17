import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAppLocale, LOCALE_COOKIE, type AppLocale } from "@/lib/i18n/locale";

type LocaleRequest = { locale?: unknown };
type LocaleResponse = { data: { locale: AppLocale } };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// The page language is this browser's choice only; it is never saved to the account.
export async function POST(request: Request) {
  let body: LocaleRequest | null;
  try {
    body = await request.json() as LocaleRequest | null;
  } catch {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !isAppLocale(body.locale)) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  const locale = body.locale;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  const response: LocaleResponse = { data: { locale } };
  return NextResponse.json(response);
}
