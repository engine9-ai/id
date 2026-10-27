import { describe, expect, it, vi } from 'vitest';

import { createCoreClient } from '../src/core';
import { DelegateIdentityError, isSiteKeyRejected, SITE_KEY_REJECTED } from '../src/errors';

describe('createCoreClient', () => {
  it('POSTs /auth/login with delegate_token and the public API key', async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example/auth/login');
      expect(init?.method).toBe('POST');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer e9publickey_test');
      expect(headers.get('X-API-Key')).toBe('e9publickey_test');
      expect(JSON.parse(String(init?.body))).toEqual({ delegate_token: 'jwt-here' });
      return new Response(
        JSON.stringify({
          token: 'session-1',
          session: { personId: 9, roles: [], domainUnid: 'site.example:u-1', level: 1 },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    });

    let stored: string | null = null;
    const core = createCoreClient({
      apiUrl: 'https://api.example',
      publicApiKey: 'e9publickey_test',
      getDelegateToken: () => 'jwt-here',
      getSessionToken: () => stored,
      setSessionToken: (token) => {
        stored = token;
      },
      fetchImpl,
    });

    const result = await core.login();
    expect(result.token).toBe('session-1');
    expect(result.session.personId).toBe(9);
    expect(stored).toBe('session-1');
  });

  it('GETs /auth/me with the session header', async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://api.example/auth/me');
      const headers = new Headers(init?.headers);
      expect(headers.get('X-Engine9-Session')).toBe('session-1');
      expect(headers.get('Authorization')).toBe('Bearer e9publickey_test');
      return new Response(JSON.stringify({ personId: 9, roles: ['vip'], level: 1 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const core = createCoreClient({
      apiUrl: 'https://api.example',
      publicApiKey: 'e9publickey_test',
      getDelegateToken: () => 'jwt-here',
      getSessionToken: () => 'session-1',
      fetchImpl,
    });

    await expect(core.me()).resolves.toMatchObject({ personId: 9, roles: ['vip'] });
  });

  it('POSTs /auth/role and forwards core.fetch headers', async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      expect(headers.get('X-API-Key')).toBe('e9publickey_test');
      if (url.endsWith('/auth/role')) {
        expect(JSON.parse(String(init?.body))).toEqual({ role_id: 'role-vip' });
        return new Response(
          JSON.stringify({ token: 'session-2', session: { roles: ['role-vip'] } }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/read/content')) {
        return new Response(JSON.stringify({ rows: [] }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(url);
    });

    const core = createCoreClient({
      apiUrl: 'https://api.example/',
      publicApiKey: 'e9publickey_test',
      getDelegateToken: () => 'jwt-here',
      getSessionToken: () => 'session-1',
      fetchImpl,
    });

    const changed = await core.changeRole('role-vip');
    expect(changed.session.roles).toEqual(['role-vip']);
    const res = await core.fetch('/read/content');
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  describe('a refused public key', () => {
    const client = (body: unknown, status = 401) =>
      createCoreClient({
        apiUrl: 'https://api.example',
        publicApiKey: 'e9publickey_test',
        getDelegateToken: () => 'jwt-here',
        getSessionToken: () => null,
        fetchImpl: async () =>
          new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
      });

    it('is site_key_rejected with the reason and hint, reported once', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const core = client({
          error: 'unauthorized: unknown_key',
          reason: 'unknown_key',
          kind: 'api_key',
          hint: 'No row in this site api_key table matches.',
        });
        const error = await core.login().catch((e: unknown) => e);
        expect(isSiteKeyRejected(error)).toBe(true);
        expect((error as DelegateIdentityError).code).toBe(SITE_KEY_REJECTED);
        expect((error as DelegateIdentityError).details).toEqual({
          status: 401,
          reason: 'unknown_key',
          hint: 'No row in this site api_key table matches.',
        });
        expect((error as Error).message).toMatch(/site setup problem/);
        await expect(core.me()).rejects.toMatchObject({ code: SITE_KEY_REJECTED });
        expect(consoleError).toHaveBeenCalledTimes(1);
      } finally {
        consoleError.mockRestore();
      }
    });

    it('is recognized from an earlier core that sends only the error text', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(client({ error: 'unauthorized: inactive_key' }).login()).rejects.toMatchObject({
          code: SITE_KEY_REJECTED,
          details: { status: 401, reason: 'inactive_key' },
        });
      } finally {
        consoleError.mockRestore();
      }
    });

    it('leaves other login failures as invalid_request with the server reason', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(
          client({ error: 'invalid identity token', reason: 'invalid_identity_token' }).login(),
        ).rejects.toMatchObject({
          code: 'invalid_request',
          message: 'invalid identity token',
          details: { status: 401, reason: 'invalid_identity_token' },
        });
        expect(consoleError).not.toHaveBeenCalled();
      } finally {
        consoleError.mockRestore();
      }
    });
  });
});
