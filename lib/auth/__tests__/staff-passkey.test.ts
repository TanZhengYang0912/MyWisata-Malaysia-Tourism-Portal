import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { encodeCBOR, type CBORType } from '@levischuck/tiny-cbor';
import { describe, expect, it } from 'vitest';
import { staffPasskeyConfig, staffPasskeyEnforcementEnabled } from '../staff-passkey-config';
import { passwordSessionClaims } from '../staff-assurance';
import { authenticationOptions, registrationOptions, verifyStaffAuthentication, verifyStaffRegistration } from '../staff-passkey';

const config = { rpID: 'mylawatan.my', origin: 'https://mylawatan.my', rpName: 'MYLawatan' };
const user = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const b64 = (value: Uint8Array) => Buffer.from(value).toString('base64url');

function authenticator(flags = 5, origin = config.origin, rpID = config.rpID) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  const key = new Map<number, CBORType>([[1, 1], [3, -8], [-1, 6], [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))]]);
  const id = randomBytes(32);
  const challenge = b64(randomBytes(32));
  const credential = { id: b64(id), publicKey: new Uint8Array(encodeCBOR(key)), counter: 0 };
  const counter = Buffer.alloc(4); counter.writeUInt32BE(1);
  const data = Buffer.concat([createHash('sha256').update(rpID).digest(), Buffer.from([flags]), counter]);
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
  const signature = sign(null, Buffer.concat([data, createHash('sha256').update(clientData).digest()]), privateKey);
  const response = { id: credential.id, rawId: credential.id, type: 'public-key' as const, clientExtensionResults: {}, response: { authenticatorData: b64(data), clientDataJSON: b64(clientData), signature: b64(signature) } };
  const registrationData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin, crossOrigin: false }));
  const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
  const attestedData = Buffer.concat([data.subarray(0, 32), Buffer.from([flags | 64]), Buffer.alloc(4), Buffer.alloc(16), length, id, credential.publicKey]);
  const attestation = encodeCBOR(new Map<string, CBORType>([['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(attestedData)]]));
  const registration = { id: credential.id, rawId: credential.id, type: 'public-key' as const, clientExtensionResults: {}, response: { clientDataJSON: b64(registrationData), attestationObject: b64(attestation) } };
  return { response, registration, credential, challenge };
}

describe('staff Passkey security contract', () => {
  it('permits the explicit legacy mode only for localhost development with demo tools', () => {
    const local = { NODE_ENV: 'development', MYWISATA_DEMO_TOOLS: 'true', MYWISATA_LOCAL_LEGACY_STAFF_AUTH: 'true', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' };
    expect(staffPasskeyEnforcementEnabled(local)).toBe(false);
    for (const override of [
      { NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { MYWISATA_ENV: 'production' },
      { VERCEL_ENV: 'production' }, { MYWISATA_DEMO_TOOLS: 'false' },
      { VERCEL_ENV: 'preview' }, { MYWISATA_ENV: 'staging' },
      { MYWISATA_LOCAL_LEGACY_STAFF_AUTH: '' }, { NEXT_PUBLIC_SITE_URL: 'https://mylawatan.my' },
      { NEXT_PUBLIC_SITE_URL: 'http://localhost.evil.example' }, { NEXT_PUBLIC_SITE_URL: 'invalid' },
      { NEXT_PUBLIC_SITE_URL: 'http://localhost:3000/other' }, { NEXT_PUBLIC_SITE_URL: 'http://user:secret@localhost:3000' },
    ]) expect(staffPasskeyEnforcementEnabled({ ...local, ...override })).toBe(true);
    expect(staffPasskeyEnforcementEnabled({})).toBe(true);
  });
  it('requires a canonical HTTPS origin in production', () => {
    expect(staffPasskeyConfig({ NEXT_PUBLIC_SITE_URL: 'https://mylawatan.my', NODE_ENV: 'production' })).toEqual(config);
    for (const url of ['http://mylawatan.my', 'https://mylawatan.my/evil', 'https://user:secret@mylawatan.my', 'http://localhost:3000']) {
      expect(() => staffPasskeyConfig({ NEXT_PUBLIC_SITE_URL: url, NODE_ENV: 'production' })).toThrow();
    }
    expect(() => staffPasskeyConfig({})).toThrow();
  });
  it('allows only an explicitly configured localhost development origin', () => {
    expect(staffPasskeyConfig({ STAFF_PASSKEY_ORIGIN: 'http://localhost:3000', NODE_ENV: 'development' }).rpID).toBe('localhost');
  });
  it('rejects passwordless, malformed, recovery and newer OAuth sessions', () => {
    const base = { sub: user, session_id: session, amr: [{ method: 'password', timestamp: 100 }] };
    expect(passwordSessionClaims(base)).toEqual({ userId: user, sessionId: session });
    for (const claims of [{ ...base, amr: [] }, { ...base, session_id: '' }, { ...base, amr: ['password'] }, { ...base, amr: [{ method: 'password', timestamp: 100 }, { method: 'recovery', timestamp: 101 }] }, { ...base, amr: [{ method: 'password', timestamp: 100 }, { method: 'oauth', timestamp: 100 }] }]) expect(passwordSessionClaims(claims)).toBeNull();
  });
  it('requires UV in registration and authentication options', async () => {
    const options = await registrationOptions(config, 'Staff', b64(randomBytes(32)), []);
    expect(options.authenticatorSelection?.userVerification).toBe('required');
    expect((await authenticationOptions(config, [])).userVerification).toBe('required');
  });
  it('accepts real signed authentication and none-attestation registration with UV', async () => {
    const fixture = authenticator();
    expect((await verifyStaffAuthentication(config, fixture.challenge, fixture.response, fixture.credential)).verified).toBe(true);
    expect((await verifyStaffRegistration(config, fixture.challenge, fixture.registration)).verified).toBe(true);
  });
  it.each([['UV missing', 1, config.origin, config.rpID], ['UP missing', 4, config.origin, config.rpID], ['wrong origin', 5, 'https://evil.example', config.rpID], ['wrong RP', 5, config.origin, 'evil.example']])('rejects %s in registration and authentication', async (_label, flags, origin, rpID) => {
    const fixture = authenticator(flags as number, origin as string, rpID as string);
    await expect(verifyStaffAuthentication(config, fixture.challenge, fixture.response, fixture.credential)).rejects.toThrow();
    await expect(verifyStaffRegistration(config, fixture.challenge, fixture.registration)).rejects.toThrow();
  });
  it('rejects changed challenges, signatures, owners and stale counters', async () => {
    const fixture = authenticator();
    await expect(verifyStaffAuthentication(config, 'different', fixture.response, fixture.credential)).rejects.toThrow();
    const bad = { ...fixture.response, response: { ...fixture.response.response, signature: b64(randomBytes(64)) } };
    expect((await verifyStaffAuthentication(config, fixture.challenge, bad, fixture.credential)).verified).toBe(false);
    await expect(verifyStaffAuthentication(config, fixture.challenge, fixture.response, { ...fixture.credential, id: b64(randomBytes(32)) })).rejects.toThrow();
    await expect(verifyStaffAuthentication(config, fixture.challenge, fixture.response, { ...fixture.credential, counter: 1 })).rejects.toThrow();
  });
});
