import { describe, expect, it, vi } from 'vitest';

import { createCoreClient } from '../src/core';

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
          session: { personId: 9, roles: [], unid: 'u-1', level: 1 },
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
});
