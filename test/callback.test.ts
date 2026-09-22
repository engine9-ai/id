import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
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
    const token = await signIdentityToken(keys, { unid: 'hash-unid', level: 1 });
    setPageUrl(`/return#delegate_token=${token}&state=st`);
    const replace = vi.spyOn(window.history, 'replaceState');

    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const identity = await id.handleCallback();
    expect(identity?.unid).toBe('hash-unid');
    expect(id.getIdentity()?.unid).toBe('hash-unid');
    expect(await id.getUnid()).toBe('hash-unid');
    expect(replace).toHaveBeenCalled();
    const cleaned = replace.mock.calls.at(-1)?.[2];
    expect(String(cleaned)).not.toContain('delegate_token');
  });

  it('verifies a query callback', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { unid: 'query-unid', level: 0 });
    setPageUrl(`/auth/delegate?delegate_token=${token}&state=st`);

    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const identity = await id.handleCallback();
    expect(identity?.unid).toBe('query-unid');
    expect(id.level).toBe(0);
    expect(id.isAnonymous).toBe(true);
  });
});
