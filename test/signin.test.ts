import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
import { createDelegateProvider } from '../src/provider';
import { skipDowngrades } from '../src/skip';
import type { FetchImpl } from '../src/types';
import { authorizeUrl, bridgeUrl } from '../src/url';
import { loginWidget, type LoginWidget } from '../src/widget';
import { createTestKeys, DOMAIN, ISSUER, mockDelegateFetch, signIdentityToken } from './helpers';

function setPageUrl(pathAndHash: string): void {
  window.history.replaceState(window.history.state, '', pathAndHash);
}

describe('login_hint on the wire', () => {
  const base = { delegateUrl: ISSUER, domain: DOMAIN, returnTo: `https://${DOMAIN}/` };

  it('sends login_hint on authorize', () => {
    const url = new URL(authorizeUrl({ ...base, loginHint: ' a@b.example ' }));
    expect(url.searchParams.get('login_hint')).toBe('a@b.example');
    expect(url.searchParams.has('consent')).toBe(false);
  });

  it('sends none by default', () => {
    const url = new URL(authorizeUrl(base));
    expect(url.searchParams.has('login_hint')).toBe(false);
    expect(url.searchParams.has('consent')).toBe(false);
  });

  it('sends login_hint on the popup bridge', () => {
    const url = new URL(bridgeUrl({ delegateUrl: ISSUER, domain: DOMAIN, loginHint: 'a@b.example' }));
    expect(url.searchParams.get('login_hint')).toBe('a@b.example');
    expect(url.searchParams.has('consent')).toBe(false);
  });
});

describe('skipDowngrades', () => {
  it('says nothing for a full-page, Google-only login', () => {
    expect(skipDowngrades({ mode: 'redirect', fields: ['email'] })).toEqual([]);
  });

  it('names each reason the provider screen will show', () => {
    const reasons = skipDowngrades({
      mode: 'popup',
      loginProviders: ['google', 'facebook'],
      loginLevel: 2,
      prompt: 'consent',
    });
    expect(reasons).toHaveLength(4);
    expect(reasons.join('\n')).toMatch(/this is a popup/);
    expect(reasons.join('\n')).toMatch(/loginProviders is google,facebook/);
    expect(reasons.join('\n')).toMatch(/loginLevel 2/);
    expect(reasons.join('\n')).toMatch(/prompt 'consent'/);
  });

  it('ignores loginLevel 2 when min_level is 3 or more, as Delegate does', () => {
    expect(skipDowngrades({ mode: 'redirect', loginLevel: 2, minLevel: 3 })).toEqual([]);
  });
});

function redirectingClient(config: Parameters<typeof createEngine9Id>[0] = {}) {
  const buildAuthorizeUrl = vi.fn(() => '#login');
  const id = createEngine9Id({
    domain: DOMAIN,
    storage: 'memory',
    ...config,
    provider: {
      id: 'test',
      discover: () => Promise.reject(new Error('unused')),
      verifyToken: () => Promise.reject(new Error('unused')),
      buildAuthorizeUrl,
    },
  });
  return { id, buildAuthorizeUrl };
}

describe('signIn', () => {
  afterEach(() => {
    setPageUrl('/');
    vi.restoreAllMocks();
  });

  it('starts a full-page login', async () => {
    const { id, buildAuthorizeUrl } = redirectingClient();
    await id.signIn({ fields: ['email'], loginHint: 'a@b.example' });
    expect(buildAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        minLevel: 1,
        fields: ['email'],
        loginHint: 'a@b.example',
      }),
    );
    expect(buildAuthorizeUrl.mock.calls[0][0]).not.toHaveProperty('consent');
    expect(buildAuthorizeUrl.mock.calls[0][0].brand).toBeUndefined();
  });

  it('keeps the client brand, and lets the caller choose the Google button look', async () => {
    const { id, buildAuthorizeUrl } = redirectingClient({ brand: { name: 'Festival', color: '#123456' } });
    await id.signIn();
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ brand: { name: 'Festival', color: '#123456' } }),
    );
    await id.signIn({ brand: { google: 'brand' } });
    expect(buildAuthorizeUrl).toHaveBeenLastCalledWith(
      expect.objectContaining({ brand: { google: 'brand' } }),
    );
  });

  it('does not redirect when the visitor is already signed in at that Level', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:here`, level: 2 });
    setPageUrl(`/#delegate_token=${token}`);
    const buildAuthorizeUrl = vi.fn(() => '#login');
    const base = createDelegateProvider({ delegateUrl: ISSUER, fetchImpl: mockDelegateFetch(keys.jwk) });
    const id = createEngine9Id({
      domain: DOMAIN,
      storage: 'memory',
      provider: { id: 'test', discover: () => base.discover(), verifyToken: (t, o) => base.verifyToken(t, o), buildAuthorizeUrl },
    });
    await id.handleCallback();
    const identity = await id.signIn({ minLevel: 2 });
    expect(identity?.sub).toBe(`${DOMAIN}:here`);
    expect(buildAuthorizeUrl).not.toHaveBeenCalled();
    await id.signIn({ minLevel: 3 });
    expect(buildAuthorizeUrl).toHaveBeenCalledTimes(1);
  });
});

describe('finishSignIn', () => {
  afterEach(() => {
    setPageUrl('/');
    vi.restoreAllMocks();
  });

  async function returningClient(coreResponse?: () => Response, core = true) {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:back`, level: 3 });
    setPageUrl(`/return#delegate_token=${token}`);
    const delegate = mockDelegateFetch(keys.jwk);
    const coreCalls: { url: string; body: string }[] = [];
    const fetchImpl: FetchImpl = async (input, init) => {
      const url = String(input);
      if (url.startsWith('https://api.site.example')) {
        coreCalls.push({ url, body: String(init?.body ?? '') });
        return coreResponse!();
      }
      return delegate(input, init);
    };
    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl,
      core: core ? { apiUrl: 'https://api.site.example', publicApiKey: 'e9publickey_x' } : undefined,
    });
    return { id, token, coreCalls };
  }

  const ok = () =>
    new Response(JSON.stringify({ token: 'core-session', session: { personId: 7, roles: ['admin'] } }), {
      headers: { 'Content-Type': 'application/json' },
    });

  it('is null when no login came back', async () => {
    const { id } = await returningClient(ok);
    setPageUrl('/');
    const onSignedIn = vi.fn();
    expect(await id.finishSignIn({ onSignedIn })).toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('verifies the token, logs in to core, then runs onSignedIn with both', async () => {
    const { id, token, coreCalls } = await returningClient(ok);
    const order: string[] = [];
    const result = await id.finishSignIn({
      onSignedIn: ({ identity, session }) => {
        order.push(`signed-in:${identity.sub}:${session?.personId}`);
      },
    });
    expect(result?.identity.sub).toBe(`${DOMAIN}:back`);
    expect(result?.session).toEqual({ personId: 7, roles: ['admin'] });
    expect(order).toEqual([`signed-in:${DOMAIN}:back:7`]);
    expect(coreCalls).toHaveLength(1);
    expect(coreCalls[0].url).toBe('https://api.site.example/auth/login');
    expect(JSON.parse(coreCalls[0].body)).toEqual({ delegate_token: token });
  });

  it('skips core when none is configured', async () => {
    const { id } = await returningClient(ok, false);
    const result = await id.finishSignIn();
    expect(result?.identity.level).toBe(3);
    expect(result?.session).toBeUndefined();
  });

  it('rejects, without onSignedIn, when core refuses and no onCoreError is given', async () => {
    const { id } = await returningClient(
      () => new Response(JSON.stringify({ error: 'no' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    );
    const onSignedIn = vi.fn();
    await expect(id.finishSignIn({ onSignedIn })).rejects.toThrow('no');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(id.getIdentity()?.sub).toBe(`${DOMAIN}:back`);
  });

  it('keeps the visitor signed in and runs onSignedIn when onCoreError handles the refusal', async () => {
    const { id } = await returningClient(
      () => new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }),
    );
    const onCoreError = vi.fn();
    const onSignedIn = vi.fn();
    const result = await id.finishSignIn({ onSignedIn, onCoreError });
    expect(onCoreError).toHaveBeenCalledTimes(1);
    expect(onSignedIn).toHaveBeenCalledWith({ identity: expect.objectContaining({ level: 3 }), session: undefined });
    expect(result?.session).toBeUndefined();
  });
});

describe('skip warnings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns once per reason when asked to, and names the reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { id } = redirectingClient({ warn: true, brand: { google: 'skip' } });
    await id.requestIdentity({ minLevel: 1, mode: 'popup' }).catch(() => {});
    await id.requestIdentity({ minLevel: 1, mode: 'popup' }).catch(() => {});
    const popup = warn.mock.calls.filter((call) => String(call[1]).includes('this is a popup'));
    expect(popup).toHaveLength(1);
    expect(warn.mock.calls[0][0]).toBe('[engine9-id]');
  });

  it('stays quiet when warn is off, and for a full-page Google-only login', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const off = redirectingClient({ warn: false, brand: { google: 'skip' } });
    await off.id.requestIdentity({ minLevel: 1, mode: 'popup' }).catch(() => {});
    const on = redirectingClient({ warn: true });
    await on.id.signIn();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('loginWidget redirect mode', () => {
  let widget: LoginWidget | undefined;
  afterEach(() => {
    widget?.destroy();
    widget = undefined;
    document.body.innerHTML = '';
  });

  function fakeId() {
    return {
      getIdentity: () => null,
      getToken: () => null,
      requestIdentity: vi.fn(async () => undefined),
      changeDelegateInfo: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      onChange: () => () => {},
      handleCallback: vi.fn(async () => null),
    };
  }

  it('makes Login a single button that starts a full-page login', async () => {
    const id = fakeId();
    widget = loginWidget({
      id: id as never,
      fields: ['email'],
      brand: { name: 'Festival' },
    });
    const root = widget.element.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.trigger')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(id.requestIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'redirect',
        fields: ['email'],
        brand: { name: 'Festival' },
      }),
    );
    expect(id.requestIdentity.mock.calls[0][0]).not.toHaveProperty('consent');
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open || dialog.hasAttribute('open')).toBe(false);
  });

  it('opens the dialog first when mode is popup', async () => {
    const id = fakeId();
    widget = loginWidget({ id: id as never, mode: 'popup' });
    const root = widget.element.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.trigger')!.click();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.open || dialog.hasAttribute('open')).toBe(true);
    expect(id.requestIdentity).not.toHaveBeenCalled();
  });

  it('opens the role chooser after a redirect return when there is no role yet', async () => {
    const identity = {
      sub: 'site.example:abc',
      level: 3,
      exp: Math.floor(Date.now() / 1000) + 3600,
      fields: { email: 'ada@example.com' },
      auth: { two_factor: false },
    };
    const id = {
      getIdentity: () => identity,
      getToken: () => 'jwt',
      requestIdentity: vi.fn(async () => undefined),
      changeDelegateInfo: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
      onChange: () => () => {},
      handleCallback: vi.fn(async () => identity),
    };
    widget = loginWidget({
      id: id as never,
      roles: [{ id: 'vip', name: 'VIP' }],
    });
    await new Promise((r) => setTimeout(r, 0));
    const dialog = widget.element.shadowRoot!.querySelector('dialog')!;
    expect(dialog.open || dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('Choose a role');
  });
});
