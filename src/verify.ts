import { base64UrlToBytes, decodeJson, utf8ToBytes } from './base64url';
import { DelegateIdentityError } from './errors';
import type { Identity, Jwk, Jwks } from './types';

export const CLOCK_SKEW_SECONDS = 60;

export interface VerifyIdentityTokenOptions {
  token: string;
  jwks: Jwks | Jwk[];
  domain: string;
  issuer: string;
  nonce?: string;
  now?: number;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

const cryptoKeyCache = new Map<string, CryptoKey>();

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new DelegateIdentityError(
      'crypto_unavailable',
      'WebCrypto SubtleCrypto is required to verify Identity Tokens',
    );
  }
  return subtle;
}

function asKeys(jwks: Jwks | Jwk[]): Jwk[] {
  return Array.isArray(jwks) ? jwks : jwks.keys ?? [];
}

function cacheId(jwk: Jwk): string {
  return `${jwk.kid ?? ''}::${jwk.x ?? ''}::${jwk.y ?? ''}`;
}

async function importVerifyKey(jwk: Jwk): Promise<CryptoKey> {
  const id = cacheId(jwk);
  const cached = cryptoKeyCache.get(id);
  if (cached) return cached;
  if (jwk.kty && jwk.kty !== 'EC') {
    throw new DelegateIdentityError('invalid_token', `Unsupported JWK kty ${jwk.kty}`);
  }
  if (jwk.alg && jwk.alg !== 'ES256') {
    throw new DelegateIdentityError('invalid_token', `Unsupported JWK alg ${jwk.alg}`);
  }
  const key = await getSubtle().importKey(
    'jwk',
    {
      kty: 'EC',
      crv: jwk.crv ?? 'P-256',
      x: jwk.x,
      y: jwk.y,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  cryptoKeyCache.set(id, key);
  return key;
}

function findJwk(keys: Jwk[], kid?: string): Jwk {
  if (kid) {
    const match = keys.find((key) => key.kid === kid);
    if (match) return match;
    throw new DelegateIdentityError('invalid_token', `No JWK for kid ${kid}`);
  }
  if (keys.length === 1) return keys[0];
  throw new DelegateIdentityError('invalid_token', 'JWT is missing kid');
}

function audienceMatches(aud: unknown, domain: string): boolean {
  if (typeof aud === 'string') return aud === domain;
  if (Array.isArray(aud)) return aud.includes(domain);
  return false;
}

function issuerMatches(iss: unknown, issuer: string): boolean {
  if (typeof iss !== 'string') return false;
  return iss.replace(/\/+$/, '') === issuer.replace(/\/+$/, '');
}

function asIdentity(payload: Record<string, unknown>): Identity {
  const pseudonym = payload.pseudonym;
  const level = payload.level;
  const sub = payload.sub;
  const exp = payload.exp;
  if (typeof pseudonym !== 'string' || !pseudonym) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is missing pseudonym');
  }
  if (typeof level !== 'number' || !Number.isFinite(level)) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is missing level');
  }
  if (typeof sub !== 'string' || !sub) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is missing sub');
  }
  if (typeof exp !== 'number') {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is missing exp');
  }
  return payload as unknown as Identity;
}

export function decodeJwt(
  token: string,
): { header: JwtHeader; payload: Record<string, unknown>; signingInput: Uint8Array; signature: Uint8Array } {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is not a compact JWT');
  }
  try {
    return {
      header: decodeJson<JwtHeader>(parts[0]),
      payload: decodeJson<Record<string, unknown>>(parts[1]),
      signingInput: utf8ToBytes(`${parts[0]}.${parts[1]}`),
      signature: base64UrlToBytes(parts[2]),
    };
  } catch {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is malformed');
  }
}

/**
 * Verify an Identity Token with WebCrypto ES256.
 * Checks `iss`, `aud === domain`, `exp` (±60s), and `nonce` when supplied.
 */
export async function verifyIdentityToken(
  opts: VerifyIdentityTokenOptions,
): Promise<Identity> {
  const { token, domain, issuer, nonce } = opts;
  const now = opts.now ?? Date.now() / 1000;
  const { header, payload, signingInput, signature } = decodeJwt(token);

  if (header.alg !== 'ES256') {
    throw new DelegateIdentityError(
      'invalid_token',
      `Unsupported JWT alg ${header.alg ?? 'missing'}`,
    );
  }

  const keys = asKeys(opts.jwks);
  const jwk = findJwk(keys, header.kid);
  const key = await importVerifyKey(jwk);
  const ok = await getSubtle().verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature as BufferSource,
    signingInput as BufferSource,
  );
  if (!ok) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token signature is invalid');
  }

  if (!issuerMatches(payload.iss, issuer)) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token issuer mismatch');
  }
  if (!audienceMatches(payload.aud, domain)) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token domain (aud) mismatch');
  }

  const exp = payload.exp;
  if (typeof exp !== 'number' || now > exp + CLOCK_SKEW_SECONDS) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token is expired');
  }
  const iat = payload.iat;
  if (typeof iat === 'number' && now + CLOCK_SKEW_SECONDS < iat) {
    throw new DelegateIdentityError('invalid_token', 'Identity Token iat is in the future');
  }

  if (nonce !== undefined) {
    if (payload.nonce !== nonce) {
      throw new DelegateIdentityError('invalid_token', 'Identity Token nonce mismatch');
    }
  }

  return asIdentity(payload);
}
