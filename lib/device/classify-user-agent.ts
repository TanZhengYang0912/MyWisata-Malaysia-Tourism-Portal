// Coarse device classification from a User-Agent string — no external
// dependency, just the handful of substrings that actually distinguish
// mobile/tablet/desktop. Not meant to be exhaustive device-detection, only
// enough to answer "roughly what did this share happen from."

export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export function classifyUserAgent(userAgent: string | null | undefined): DeviceClass {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();

  const isAndroid = ua.includes('android');
  const isMobileFlagged = ua.includes('mobile'); // Android UAs append "Mobile" only on phones, not tablets

  if (ua.includes('ipad') || ua.includes('tablet') || (isAndroid && !isMobileFlagged)) {
    return 'tablet';
  }
  if (ua.includes('iphone') || ua.includes('ipod') || (isAndroid && isMobileFlagged) || ua.includes('mobi')) {
    return 'mobile';
  }
  if (ua.includes('windows') || ua.includes('macintosh') || ua.includes('linux') || ua.includes('cros')) {
    return 'desktop';
  }
  return 'unknown';
}
