import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAppLocale, LOCALE_COOKIE, type AppLocale } from "@/lib/i18n/locale";
import { createClient } from "@/lib/supabase/server";

type LocaleRequest = { locale?: unknown };
type LocaleResponse = { data: { locale: AppLocale; persistedToAccount: boolean } };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  let body: LocaleRequest;
  try {
    body = await request.json() as LocaleRequest;
  } catch {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  if (!isAppLocale(body.locale)) {
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
  }

  const locale = body.locale;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let persistedToAccount = false;

  if (user) {
    const { error } = await supabase
      .from("users")
      .update({ preferred_locale: locale })
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    persistedToAccount = true;
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  const response: LocaleResponse = {
    data: { locale, persistedToAccount },
  };
  return NextResponse.json(response);
}
