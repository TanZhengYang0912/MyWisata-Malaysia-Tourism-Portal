/** Only accept connection metadata supplied by the hosting platform, never a body field. */
export function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  const firstForwarded = forwarded?.split(',')[0]?.trim();
  return firstForwarded || request.headers.get('x-real-ip')?.trim() || null;
}
