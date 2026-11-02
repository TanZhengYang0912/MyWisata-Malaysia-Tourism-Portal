import { describe,expect,it,vi } from 'vitest';
vi.mock('@/lib/supabase/service',()=>({createServiceClient:vi.fn()}));
import { newGuestCredential,hashGuestCredential,setGuestCookie,guestPrivateResponse,readGuestCookie,isSameOriginMutation,readGuestJson,guestAddressRateKey,guestCookieName } from '../guest-session';
describe('private guest credentials',()=>{
 it('trusts only the explicitly configured proxy and validates its final address',()=>{
  const originalVercel=process.env.VERCEL; const originalProxy=process.env.GUEST_TRUSTED_PROXY;
  try {
   delete process.env.VERCEL; delete process.env.GUEST_TRUSTED_PROXY;
   const request=new Request('https://example.test',{headers:{'x-forwarded-for':'198.51.100.1, 203.0.113.2','x-real-ip':'192.0.2.3'}});
   expect(guestAddressRateKey(request)).toBe('guest-address:unavailable');
   process.env.GUEST_TRUSTED_PROXY='hostinger-cdn';
   expect(guestAddressRateKey(request)).toBe('guest-address:203.0.113.2');
   expect(guestAddressRateKey(new Request(request.url,{headers:{'x-forwarded-for':'203.0.113.2, invalid'}}))).toBe('guest-address:unavailable');
   expect(guestAddressRateKey(new Request(request.url,{headers:{'x-real-ip':'203.0.113.2'}}))).toBe('guest-address:unavailable');
   process.env.VERCEL='1';
   expect(guestAddressRateKey(new Request(request.url,{headers:{'x-vercel-forwarded-for':'203.0.113.4, 198.51.100.5'}}))).toBe('guest-address:203.0.113.4');
  } finally {
   if(originalVercel===undefined) delete process.env.VERCEL; else process.env.VERCEL=originalVercel;
   if(originalProxy===undefined) delete process.env.GUEST_TRUSTED_PROXY; else process.env.GUEST_TRUSTED_PROXY=originalProxy;
  }
 });
 it('issues 256-bit opaque secrets and keeps them out of JSON',()=>{
  const token=newGuestCredential();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(hashGuestCredential(token)).toMatch(/^[a-f0-9]{64}$/);
  expect(newGuestCredential()).not.toBe(token);
  const request=new Request('https://mylawatan.example/api/guest/session');const response=guestPrivateResponse({ready:true});setGuestCookie(response,request,token);
  const cookie=response.headers.get('set-cookie')!;
  expect(cookie).toContain('__Host-mylawatan-guest=');expect(cookie).toContain('HttpOnly');expect(cookie).toContain('Secure');expect(cookie).toContain('SameSite=lax');expect(cookie).toContain('Path=/');expect(cookie).not.toContain('Domain=');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(readGuestCookie(new Request(request.url,{headers:{cookie:`__Host-mylawatan-guest=${token}`}}))).toBe(token);
  expect(readGuestCookie(new Request(request.url,{headers:{cookie:`__Host-mywisata-guest=${token}`}}))).toBe(token);
 });
 it('rejects same-site but different origin writes and malformed credentials',()=>{
  expect(isSameOriginMutation(new Request('https://app.example/api',{headers:{origin:'https://other.app.example'}}))).toBe(false);
  expect(isSameOriginMutation(new Request('https://app.example/api',{headers:{origin:'https://app.example','sec-fetch-site':'cross-site'}}))).toBe(false);
  expect(isSameOriginMutation(new Request('https://app.example/api',{headers:{origin:'https://app.example'}}))).toBe(true);
  expect(readGuestCookie(new Request('https://app.example',{headers:{cookie:'__Host-mywisata-guest=email@example.com'}}))).toBeNull();
 });
 it('uses the configured public HTTPS origin behind an internal HTTP request URL',()=>{
  const original={appUrl:process.env.APP_URL,publicAppUrl:process.env.NEXT_PUBLIC_APP_URL};
  try {
   vi.stubEnv('NODE_ENV','production');
   process.env.APP_URL='https://mylawatan.my';
   process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';
   const request=new Request('http://127.0.0.1:3000/api/guest/session',{headers:{origin:'https://mylawatan.my','sec-fetch-site':'same-origin','x-forwarded-host':'attacker.example','x-forwarded-proto':'https'}});
   expect(isSameOriginMutation(request)).toBe(true);
   expect(guestCookieName(request)).toBe('__Host-mylawatan-guest');
   const response=guestPrivateResponse({ready:true});
   setGuestCookie(response,request,'a'.repeat(43));
   const cookie=response.headers.get('set-cookie')!;
   expect(cookie).toContain('__Host-mylawatan-guest=');
   expect(cookie).toContain('Secure');
   expect(readGuestCookie(new Request(request.url,{headers:{cookie:`__Host-mylawatan-guest=${'a'.repeat(43)}`}}))).toBe('a'.repeat(43));
   const orderResponse=guestPrivateResponse({orderId:'order'});
   setGuestCookie(orderResponse,request,'c'.repeat(43),true);
   const orderCookie=orderResponse.headers.get('set-cookie')!;
   expect(orderCookie).toContain('__Host-mylawatan-order-access=');
   expect(orderCookie).toContain('Secure');
   expect(readGuestCookie(new Request(request.url,{headers:{cookie:`__Host-mywisata-order-access=${'d'.repeat(43)}`}}),true)).toBe('d'.repeat(43));
  } finally {
   vi.unstubAllEnvs();
   if(original.appUrl===undefined) delete process.env.APP_URL; else process.env.APP_URL=original.appUrl;
   if(original.publicAppUrl===undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL=original.publicAppUrl;
  }
 });
 it('keeps production source checks exact and fails closed for invalid public-origin config',()=>{
  const original={appUrl:process.env.APP_URL,publicAppUrl:process.env.NEXT_PUBLIC_APP_URL};
  try {
   vi.stubEnv('NODE_ENV','production');
   process.env.APP_URL='https://mylawatan.my';
   process.env.NEXT_PUBLIC_APP_URL='https://mylawatan.my';
   for(const origin of ['https://evil.example','https://mylawatan.my.evil.example','https://sub.mylawatan.my','https://mylawatan.my:4444','null']){
    expect(isSameOriginMutation(new Request('http://127.0.0.1:3000/api/guest/session',{headers:{origin,'sec-fetch-site':'same-origin','x-forwarded-host':'mylawatan.my','x-forwarded-proto':'https'}}))).toBe(false);
   }
   expect(isSameOriginMutation(new Request('http://127.0.0.1:3000/api/guest/session',{headers:{origin:'https://mylawatan.my','sec-fetch-site':'cross-site'}}))).toBe(false);
   expect(isSameOriginMutation(new Request('http://127.0.0.1:3000/api/guest/session',{headers:{origin:'https://mylawatan.my','sec-fetch-site':'none'}}))).toBe(false);
   expect(isSameOriginMutation(new Request('http://127.0.0.1:3000/api/guest/session',{headers:{'sec-fetch-site':'same-origin'}}))).toBe(false);
   process.env.APP_URL='https://mylawatan.my';
   vi.stubEnv('NODE_ENV','staging');
   expect(isSameOriginMutation(new Request('http://127.0.0.1:3000/api/guest/session',{headers:{origin:'http://127.0.0.1:3000'}}))).toBe(false);
   process.env.APP_URL='http://localhost:3000';
   expect(isSameOriginMutation(new Request('https://mylawatan.my/api/guest/session',{headers:{origin:'https://mylawatan.my'}}))).toBe(false);
   expect(guestCookieName(new Request('https://mylawatan.my/api/guest/session'))).toBeNull();
   expect(readGuestCookie(new Request('https://mylawatan.my/api/guest/session',{headers:{cookie:`__Host-mylawatan-guest=${'b'.repeat(43)}`}}))).toBeNull();
   const response=guestPrivateResponse({ready:true});
   setGuestCookie(response,new Request('https://mylawatan.my/api/guest/session'),'b'.repeat(43));
   expect(response.headers.get('set-cookie')).toBeNull();
  } finally {
   vi.unstubAllEnvs();
   if(original.appUrl===undefined) delete process.env.APP_URL; else process.env.APP_URL=original.appUrl;
   if(original.publicAppUrl===undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL=original.publicAppUrl;
  }
 });
 it('keeps development guest cookies non-prefixed and readable on localhost',()=>{
  const original={appUrl:process.env.APP_URL,publicAppUrl:process.env.NEXT_PUBLIC_APP_URL};
  try {
   vi.stubEnv('NODE_ENV','development');
   const request=new Request('http://localhost:3000/api/guest/session',{headers:{origin:'http://localhost:3000'}});
   expect(isSameOriginMutation(request)).toBe(true);
   expect(guestCookieName(request)).toBe('mylawatan-guest');
   const response=guestPrivateResponse({ready:true});
   setGuestCookie(response,request,'e'.repeat(43));
   const cookie=response.headers.get('set-cookie')!;
   expect(cookie).toContain('mylawatan-guest=');
   expect(cookie).not.toContain('Secure');
   expect(readGuestCookie(new Request(request.url,{headers:{cookie:`mylawatan-guest=${'e'.repeat(43)}`}}))).toBe('e'.repeat(43));
  } finally {
   vi.unstubAllEnvs();
   if(original.appUrl===undefined) delete process.env.APP_URL; else process.env.APP_URL=original.appUrl;
   if(original.publicAppUrl===undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL=original.publicAppUrl;
  }
 });
 it('falls back to a valid legacy cookie when the new cookie is malformed',()=>{
  const valid='a'.repeat(43);
  const request=new Request('https://app.example',{headers:{cookie:`__Host-mylawatan-guest=invalid; __Host-mywisata-guest=${valid}`}});
  expect(readGuestCookie(request)).toBe(valid);
 });
 it('bounds body consumption and handles invalid JSON',async()=>{
  expect(await readGuestJson(new Request('https://app.example',{method:'POST',body:JSON.stringify({email:'a@example.com'})}))).toEqual({email:'a@example.com'});
  expect(await readGuestJson(new Request('https://app.example',{method:'POST',body:'x'.repeat(32769)}))).toBeNull();
  expect(await readGuestJson(new Request('https://app.example',{method:'POST',body:'invalid'}))).toBeNull();
 });
});
