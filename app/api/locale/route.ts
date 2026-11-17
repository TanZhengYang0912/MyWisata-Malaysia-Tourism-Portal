import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAppLocale, LOCALE_COOKIE, type AppLocale } from "@/lib/i18n/locale";
import { createClient } from "@/lib/supabase/server";

type LocaleRequest = { locale?: unknown };
type LocaleResponse = { data: { locale: AppLocale } };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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
  const hasAuthCookie = cookieStore.getAll().some(({ name }) => (
    name.startsWith("sb-") && /-auth-token(?:\.\d+)?$/.test(name)
  ));
  if (hasAuthCookie) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError && authError.name !== "AuthSessionMissingError" && authError.status !== 401) {
      return NextResponse.json({ error: "Unable to verify session" }, { status: 503 });
    }
    if (user && !user.is_anonymous) {
      const { error } = await supabase.rpc("set_my_preferred_locale", { p_locale: locale });
      if (error) {
        return NextResponse.json({ error: "Unable to save language preference" }, { status: 500 });
      }
    }
  }

  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  const response: LocaleResponse = { data: { locale } };
  return NextResponse.json(response);
}
