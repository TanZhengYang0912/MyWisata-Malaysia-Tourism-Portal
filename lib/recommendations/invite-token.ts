import { createHash, randomBytes } from 'node:crypto';

export function createRecommendationInviteToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: createHash('sha256').update(token).digest('hex') };
}

export function hashRecommendationInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
