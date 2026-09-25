/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import { verifyIdentityToken } from '../src/verify';
import {
  createTestKeys,
  ISSUER,
  signIdentityToken,
  DOMAIN,
  tamperToken,
} from './helpers';

describe('verifyIdentityToken', () => {
  it('verifies an ES256 Identity Token', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:u-42`, level: 2 });
    const identity = await verifyIdentityToken({
      token,
      jwks: { keys: [keys.jwk] },
      domain: DOMAIN,
      issuer: ISSUER,
    });
    expect(identity.sub).toBe(`${DOMAIN}:u-42`);
    expect(identity.level).toBe(2);
    expect(identity.aud).toBe(DOMAIN);
    expect(identity.iss).toBe(ISSUER);
  });

  it('rejects a tampered payload', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys);
    await expect(
      verifyIdentityToken({
        token: tamperToken(token),
        jwks: { keys: [keys.jwk] },
        domain: DOMAIN,
        issuer: ISSUER,
      }),
    ).rejects.toThrow(/signature/i);
  });

  it('rejects a sub that is not a Domain UNID for this domain', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: 'other.example:abc' });
    await expect(
      verifyIdentityToken({
        token,
        jwks: { keys: [keys.jwk] },
        domain: DOMAIN,
        issuer: ISSUER,
      }),
    ).rejects.toThrow(/Domain UNID/);
  });

  it('rejects the wrong domain (aud)', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, {}, { aud: 'other.example' });
    await expect(
      verifyIdentityToken({
        token,
        jwks: { keys: [keys.jwk] },
        domain: DOMAIN,
        issuer: ISSUER,
      }),
    ).rejects.toThrow(/aud|domain/i);
  });

  it('rejects an expired token beyond the 60s skew', async () => {
    const keys = await createTestKeys();
    const now = Math.floor(Date.now() / 1000);
    const token = await signIdentityToken(
      keys,
      {},
      { iat: now - 4000, exp: now - 120 },
    );
    await expect(
      verifyIdentityToken({
        token,
        jwks: { keys: [keys.jwk] },
        domain: DOMAIN,
        issuer: ISSUER,
        now,
      }),
    ).rejects.toThrow(/expired/i);
  });

  it('rejects a nonce mismatch', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { nonce: 'abc' });
    await expect(
      verifyIdentityToken({
        token,
        jwks: { keys: [keys.jwk] },
        domain: DOMAIN,
        issuer: ISSUER,
        nonce: 'xyz',
      }),
    ).rejects.toThrow(/nonce/i);
  });
});
