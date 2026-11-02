import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
import { createCoreClient } from '../src/core';
import { createDelegateProvider } from '../src/provider';
import { createTestKeys, DOMAIN, ISSUER, mockDelegateFetch, postMessage, signIdentityToken } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe("core client with session: 'cookie'", () => {
  it('logs in with cookie: true and the state, sends no session header, and keeps no token', async () => {
    const seen: { url: string; body?: unknown; headers: Headers }[] = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      seen.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        headers: new Headers(init?.headers),
      });
      if (String(input).endsWith('/auth/login')) return json({ session: { personId: 9, roles: [] } });
      if (String(input).endsWith('/auth/begin')) return json({ state: 'S1', nonce: 'N1' });
      return json({ loggedOut: true });
    });
    let state: string | null = 'S1';
    const setSessionToken = vi.fn();
    const core = createCoreClient({
      apiUrl: '/api',
      publicApiKey: 'e9publickey_test',
      session: 'cookie',
      getDelegateToken: () => 'jwt-here',
      getSessionToken: () => 'stale-header-token',
      setSessionToken,
      getLoginState: () => state,
      clearLoginState: () => {
        state = null;
      },
      fetchImpl,
    });

    await expect(core.begin()).resolves.toEqual({ state: 'S1', nonce: 'N1' });
    const result = await core.login();
    expect(result.token).toBeUndefined();
    expect(result.session.personId).toBe(9);
    const login = seen.find((call) => call.url === '/api/auth/login')!;
    expect(login.body).toEqual({ delegate_token: 'jwt-here', cookie: true, state: 'S1' });
    expect(login.headers.get('X-Engine9-Session')).toBeNull();
    expect(login.headers.get('X-API-Key')).toBe('e9publickey_test');
    expect(state).toBeNull();
    expect(setSessionToken).toHaveBeenLastCalledWith(null);

    await core.logout();
    expect(seen.at(-1)?.url).toBe('/api/auth/logout');
  });

  it('says which core is needed when /auth/begin is missing', async () => {
    const core = createCoreClient({
      apiUrl: '/api',
      publicApiKey: 'e9publickey_test',
      session: 'cookie',
      getDelegateToken: () => null,
      fetchImpl: async () => json({ error: 'not found' }, 200),
    });
    await expect(core.begin()).rejects.toThrow(/1\.18\.0/);
  });

  it('warns when apiUrl is on another host, where the cookie would not be sent', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createCoreClient({
      apiUrl: 'https://api.other.example',
      publicApiKey: 'e9publickey_test',
      session: 'cookie',
      getDelegateToken: () => null,
    });
    expect(error.mock.calls[0]?.[1]).toMatch(/not on this page's host/);
  });
});

describe("popup sign-in with session: 'cookie'", () => {
  it('opens the popup inside the click, then asks Delegate with the nonce core issued', async () => {
    const keys = await createTestKeys();
    const delegateFetch = mockDelegateFetch(keys.jwk);
    const coreCalls: { url: string; body: unknown }[] = [];
    const order: string[] = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('/api/')) {
        order.push(url);
        coreCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url === '/api/auth/begin') return json({ state: 'core-state', nonce: 'core-nonce' });
        if (url === '/api/auth/login') return json({ session: { personId: 4, roles: [] } });
      }
      return delegateFetch(input, init);
    };
    const replace = vi.fn();
    const popup = { closed: false, close: vi.fn(), location: { replace } } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockImplementation(() => {
      order.push('window.open');
      return popup;
    });

    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl,
      core: { apiUrl: '/api', publicApiKey: 'e9publickey_test', session: 'cookie' },
    });
    const pending = id.requestIdentity({ minLevel: 1, mode: 'popup' });
    // Synchronously, inside the click: an empty window, before any network call.
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe('');
    expect(order[0]).toBe('window.open');

    await vi.waitFor(() => expect(replace).toHaveBeenCalled());
    const bridge = new URL(replace.mock.calls[0][0]);
    expect(bridge.pathname).toBe('/identity/bridge');
    expect(bridge.searchParams.get('nonce')).toBe('core-nonce');
    expect(bridge.searchParams.get('state')).toBe('core-state');
    expect(order.slice(0, 2)).toEqual(['window.open', '/api/auth/begin']);

    const token = await signIdentityToken(keys, { level: 3, nonce: 'core-nonce' });
    postMessage(ISSUER, { type: 'delegate-identity', token, state: 'core-state' });
    await expect(pending).resolves.toMatchObject({ level: 3 });

    const { session } = await id.core!.login();
    expect(session.personId).toBe(4);
    expect(coreCalls.at(-1)).toEqual({
      url: '/api/auth/login',
      body: { delegate_token: token, cookie: true, state: 'core-state' },
    });
  });

  it('carries the core state through a redirect sign-in to the cookie login', async () => {
    const keys = await createTestKeys();
    const coreBodies: unknown[] = [];
    const fetchImpl = async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/auth/begin') return json({ state: 'redirect-state', nonce: 'redirect-nonce' });
      if (url === '/api/auth/login') {
        coreBodies.push(JSON.parse(String(init?.body)));
        return json({ session: { personId: 5, roles: [] } });
      }
      return mockDelegateFetch(keys.jwk)(input, init);
    };
    const base = createDelegateProvider({ delegateUrl: ISSUER, fetchImpl });
    const buildAuthorizeUrl = vi.fn(() => '#to-delegate');
    const make = () =>
      createEngine9Id({
        domain: DOMAIN,
        storage: 'session',
        fetchImpl,
        provider: {
          id: base.id,
          discover: () => base.discover(),
          verifyToken: (t, o) => base.verifyToken(t, o),
          buildAuthorizeUrl,
        },
        core: { apiUrl: '/api', publicApiKey: 'e9publickey_test', session: 'cookie' },
      });
    sessionStorage.clear();
    const open = vi.spyOn(window, 'open');
    await make().requestIdentity({ minLevel: 1, mode: 'redirect' });
    expect(open).not.toHaveBeenCalled();
    expect(buildAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'redirect-nonce', state: 'redirect-state' }),
    );

    // Back from Delegate on a fresh page.
    const token = await signIdentityToken(keys, { level: 3, nonce: 'redirect-nonce' });
    window.history.replaceState(null, '', `/back#delegate_token=${token}&state=redirect-state`);
    const id = make();
    await expect(id.handleCallback()).resolves.toMatchObject({ level: 3 });
    await id.core!.login();
    expect(coreBodies).toEqual([{ delegate_token: token, cookie: true, state: 'redirect-state' }]);
    window.history.replaceState(null, '', '/');
    sessionStorage.clear();
  });

  it('closes the empty popup when core cannot start the sign-in', async () => {
    const popup = { closed: false, close: vi.fn(), location: { replace: vi.fn() } } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: async () => json({ error: 'boom' }, 500),
      core: { apiUrl: '/api', publicApiKey: 'e9publickey_test', session: 'cookie' },
    });
    await expect(id.requestIdentity({ minLevel: 1, mode: 'popup' })).rejects.toThrow();
    expect(popup.close).toHaveBeenCalled();
  });

  it('ends the core session on logout', async () => {
    const urls: string[] = [];
    const id = createEngine9Id({
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: async (input) => {
        urls.push(String(input));
        return json({ loggedOut: true });
      },
      core: { apiUrl: '/api', publicApiKey: 'e9publickey_test', session: 'cookie' },
    });
    await id.logout();
    expect(urls).toEqual(['/api/auth/logout']);
  });
});
