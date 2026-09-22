import { exportJWK, generateKeyPair, SignJWT, type GenerateKeyPairResult } from 'jose';

import type { FetchImpl, Jwk } from '../src/types';

export const ISSUER = 'https://delegate.engine9.ai';
export const SITE = 'https://site.example';

export interface TestKeys {
  privateKey: GenerateKeyPairResult['privateKey'];
  jwk: Jwk;
  kid: string;
}

export async function createTestKeys(kid = `kid-${crypto.randomUUID()}`): Promise<TestKeys> {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = (await exportJWK(publicKey)) as Jwk;
  jwk.kid = kid;
  jwk.alg = 'ES256';
  jwk.use = 'sig';
  return { privateKey, jwk, kid };
}

export async function signIdentityToken(
  keys: TestKeys,
  claims: Record<string, unknown> = {},
  options: {
    aud?: string;
    iss?: string;
    exp?: string | number;
    iat?: number;
    sub?: string;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    unid: 'u-1',
    level: 0,
    ...claims,
  };
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', kid: keys.kid, typ: 'JWT' })
    .setIssuer(options.iss ?? ISSUER)
    .setAudience(options.aud ?? SITE)
    .setSubject(options.sub ?? (typeof payload.sub === 'string' ? payload.sub : `unid:${payload.unid}`))
    .setJti('jti-1');
  if (options.iat !== undefined) jwt = jwt.setIssuedAt(options.iat);
  else jwt = jwt.setIssuedAt(now);
  jwt = jwt.setExpirationTime(options.exp ?? now + 3600);
  return jwt.sign(keys.privateKey);
}

export function tamperToken(token: string): string {
  const [header, payload, signature] = token.split('.');
  const json = JSON.parse(Buffer.from(payload, 'base64url').toString());
  json.unid = 'tampered';
  const next = Buffer.from(JSON.stringify(json)).toString('base64url');
  return `${header}.${next}.${signature}`;
}

export function mockDelegateFetch(jwk: Jwk, issuer = ISSUER): FetchImpl {
  return async (input) => {
    const url = String(input);
    if (url.includes('delegate-configuration')) {
      return new Response(
        JSON.stringify({
          issuer,
          jwks_uri: `${issuer}/.well-known/jwks.json`,
          identity_authorize_endpoint: `${issuer}/identity/authorize`,
          identity_bridge_endpoint: `${issuer}/identity/bridge`,
          logout_endpoint: `${issuer}/identity/logout`,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.includes('jwks')) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
}

export function postMessage(
  origin: string,
  data: unknown,
): void {
  const event = new MessageEvent('message', { data });
  Object.defineProperty(event, 'origin', { value: origin });
  window.dispatchEvent(event);
}
