import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  isReferenceCurrency,
  REFERENCE_CURRENCY_COOKIE,
  type ReferenceCurrency,
} from "@/lib/currency/reference";

type CurrencyRequest = { currency?: unknown };
type CurrencyResponse = { data: { currency: ReferenceCurrency } };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  let body: CurrencyRequest | null;
  try {
    body = await request.json() as CurrencyRequest | null;
  } catch {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !isReferenceCurrency(body.currency)) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(REFERENCE_CURRENCY_COOKIE, body.currency, {
    path: "/",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });

  const response: CurrencyResponse = { data: { currency: body.currency } };
  return NextResponse.json(response);
}
