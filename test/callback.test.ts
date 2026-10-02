import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
import { createDelegateProvider } from '../src/provider';
import { parseDelegateCallback } from '../src/url';
import {
  createTestKeys,
  ISSUER,
  mockDelegateFetch,
  signIdentityToken,
  DOMAIN,
} from './helpers';

function setPageUrl(pathAndHash: string): void {
  window.history.replaceState(window.history.state, '', pathAndHash);
}

describe('parseDelegateCallback', () => {
  it('reads delegate_token from the hash', () => {
    const parsed = parseDelegateCallback(
      'https://site.example/back#delegate_token=abc.def.ghi&state=s1',
    );
    expect(parsed).toEqual({ token: 'abc.def.ghi', state: 's1', error: undefined });
  });

  it('reads delegate_token from the query', () => {
    const parsed = parseDelegateCallback(
      'https://site.example/auth/delegate?delegate_token=abc.def.ghi&state=s2',
    );
    expect(parsed).toEqual({ token: 'abc.def.ghi', state: 's2', error: undefined });
  });
});

describe('handleCallback', () => {
  afterEach(() => {
    setPageUrl('/');
    vi.restoreAllMocks();
  });

  it('verifies a hash callback, stores identity, and cleans the URL', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:hash-unid`, level: 1 });
    setPageUrl(`/return#delegate_token=${token}&state=st`);
    const replace = vi.spyOn(window.history, 'replaceState');

    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const identity = await id.handleCallback();
    expect(identity?.sub).toBe(`${DOMAIN}:hash-unid`);
    expect(id.getIdentity()?.sub).toBe(`${DOMAIN}:hash-unid`);
    expect(await id.getDomainUnid()).toBe(`${DOMAIN}:hash-unid`);
    expect(replace).toHaveBeenCalled();
    const cleaned = replace.mock.calls.at(-1)?.[2];
    expect(String(cleaned)).not.toContain('delegate_token');
  });

  it('verifies a query callback', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:query-unid`, level: 0 });
    setPageUrl(`/auth/delegate?delegate_token=${token}&state=st`);

    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const identity = await id.handleCallback();
    expect(identity?.sub).toBe(`${DOMAIN}:query-unid`);
    expect(identity?.fields).toBeUndefined();
    expect(id.level).toBe(0);
    expect(id.isAnonymous).toBe(true);
  });
});

describe('changeDelegateInfo', () => {
  afterEach(() => {
    setPageUrl('/');
    vi.restoreAllMocks();
  });

  it('repeats the Grant request with prompt=select', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, {
      sub: `${DOMAIN}:changer`,
      level: 3,
      fields: { email: 'alex@gmail.com', email_verified: true },
      grant: {
        id: 'g1',
        granted_at: '2026-09-30T00:00:00.000Z',
        requested: ['display_name', 'email', 'phone'],
        required: ['display_name', 'email'],
        shared: ['display_name', 'email'],
      },
    });
    setPageUrl(`/troupe#delegate_token=${token}`);
    const base = createDelegateProvider({
      delegateUrl: ISSUER,
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const buildAuthorizeUrl = vi.fn(() => '#changing');
    const id = createEngine9Id({
      domain: DOMAIN,
      storage: 'memory',
      provider: {
        id: base.id,
        discover: () => base.discover(),
        verifyToken: (t, o) => base.verifyToken(t, o),
        buildAuthorizeUrl,
      },
    });
    await id.handleCallback();

    await id.changeDelegateInfo({ mode: 'redirect' });
    expect(buildAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: DOMAIN,
        prompt: 'select',
        minLevel: 1,
        fields: ['display_name', 'email'],
        optionalFields: ['phone'],
      }),
    );

    await id.changeDelegateInfo({ mode: 'redirect', minLevel: 2, fields: ['email'] });
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ prompt: 'select', minLevel: 2, fields: ['email'] }),
    );
  });
});

describe('loginLevel', () => {
  function redirectingClient(loginLevel?: 2 | 3) {
    const buildAuthorizeUrl = vi.fn(() => '#login');
    const id = createEngine9Id({
      domain: DOMAIN,
      storage: 'memory',
      loginLevel,
      provider: {
        id: 'test',
        discover: () => Promise.reject(new Error('unused')),
        verifyToken: () => Promise.reject(new Error('unused')),
        buildAuthorizeUrl,
      },
    });
    return { id, buildAuthorizeUrl };
  }

  afterEach(() => setPageUrl('/'));

  it('sends nothing by default, so delegate shows the Google-only screen', async () => {
    const { id, buildAuthorizeUrl } = redirectingClient();
    await id.requestIdentity({ minLevel: 1, mode: 'redirect' });
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ loginLevel: undefined }),
    );
  });

  it('applies the client loginLevel to every request, and a request can override it', async () => {
    const { id, buildAuthorizeUrl } = redirectingClient(2);
    await id.requestIdentity({ minLevel: 1, mode: 'redirect' });
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ loginLevel: 2 }),
    );
    await id.requestIdentity({ minLevel: 1, mode: 'redirect', loginLevel: 3 });
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ loginLevel: 3 }),
    );
    await id.ensureLevel(2, { mode: 'redirect' });
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ loginLevel: 2 }),
    );
  });
});
