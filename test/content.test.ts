import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
import { bindContent, gateFromElement, mount } from '../src/content';
import { meetsGate } from '../src/levels';
import {
  createTestKeys,
  DOMAIN,
  ISSUER,
  mockDelegateFetch,
  signIdentityToken,
} from './helpers';

function setPageUrl(pathAndHash: string): void {
  window.history.replaceState(window.history.state, '', pathAndHash);
}

function html(markup: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = markup;
  document.body.appendChild(root);
  return root;
}

const q = <T extends Element = HTMLElement>(root: Element, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};

afterEach(() => {
  document.body.innerHTML = '';
  setPageUrl('/');
  vi.restoreAllMocks();
});

describe('meetsGate', () => {
  it('treats no identity as Level 0', () => {
    expect(meetsGate({ minLevel: 1 }, null)).toBe(false);
    expect(meetsGate({ maxLevel: 0 }, null)).toBe(true);
    expect(meetsGate(null, null)).toBe(true);
  });

  it('checks minLevel, maxLevel, and twoFactor together', () => {
    const level2 = { level: 2, auth: { two_factor: false } };
    expect(meetsGate({ minLevel: 1 }, level2)).toBe(true);
    expect(meetsGate({ minLevel: 3 }, level2)).toBe(false);
    expect(meetsGate({ maxLevel: 1 }, level2)).toBe(false);
    expect(meetsGate({ minLevel: 1, maxLevel: 2 }, level2)).toBe(true);
    expect(meetsGate({ twoFactor: true }, level2)).toBe(false);
    expect(meetsGate({ twoFactor: true }, { level: 4, auth: { two_factor: true } })).toBe(true);
  });
});

describe('gateFromElement', () => {
  it('reads data-e9 attributes', () => {
    const root = html(
      '<div id="a" data-e9-min-level="1" data-e9-max-level="3"></div>' +
        '<div id="b" data-e9-two-factor></div>' +
        '<div id="c"></div>' +
        '<div id="d" data-e9-min-level="not-a-number"></div>',
    );
    expect(gateFromElement(q(root, '#a'))).toEqual({ minLevel: 1, maxLevel: 3 });
    expect(gateFromElement(q(root, '#b'))).toEqual({ twoFactor: true });
    expect(gateFromElement(q(root, '#c'))).toBeNull();
    expect(gateFromElement(q(root, '#d'))).toBeNull();
  });
});

describe('id.gate', () => {
  it('fires onBlock now and onAllow after identity arrives', async () => {
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:gate`, level: 1 });
    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const onAllow = vi.fn();
    const onBlock = vi.fn();
    const onChange = vi.fn();
    const off = id.gate({ minLevel: 1, onAllow, onBlock, onChange });
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onAllow).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(false, null);

    setPageUrl(`/article#delegate_token=${token}`);
    await id.handleCallback();
    expect(onAllow).toHaveBeenCalledTimes(1);
    expect(onAllow.mock.calls[0][0]?.sub).toBe(`${DOMAIN}:gate`);
    expect(onChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ level: 1 }));

    id.logout();
    expect(onBlock).toHaveBeenCalledTimes(2);

    off();
    setPageUrl(`/article#delegate_token=${token}`);
    await id.handleCallback();
    expect(onAllow).toHaveBeenCalledTimes(1);
  });
});

describe('bindContent', () => {
  const PAGE =
    '<button id="login" data-e9-login>Log in</button>' +
    '<button id="login2" data-e9-login="2" data-e9-fields="given_name, email">Verify</button>' +
    '<button id="logout" data-e9-logout>Log out</button>' +
    '<p id="hello" data-e9-min-level="1" hidden>Hi <span data-e9-profile="given_name">friend</span></p>' +
    '<article id="story" data-e9-min-level="1" hidden>Full story</article>' +
    '<div id="paywall" data-e9-max-level="0">Log in to keep reading</div>' +
    '<div id="mfa" data-e9-two-factor hidden>Two-factor only</div>' +
    '<span id="lvl" data-e9-level></span><span id="lvlname" data-e9-level="name"></span>';

  it('hides gated content for anonymous visitors and shows the paywall', () => {
    const root = html(PAGE);
    const id = createEngine9Id({ domain: DOMAIN, storage: 'memory' });
    bindContent(id, { root });

    expect(q(root, '#story').hidden).toBe(true);
    expect(q(root, '#hello').hidden).toBe(true);
    expect(q(root, '#paywall').hidden).toBe(false);
    expect(q(root, '#mfa').hidden).toBe(true);
    expect(q(root, '#login').hidden).toBe(false);
    expect(q(root, '#logout').hidden).toBe(true);
    expect(q(root, '#lvl').textContent).toBe('0');
    expect(q(root, '#lvlname').textContent).toBe('Inferred');
    expect(q(root, '#story').getAttribute('data-e9-state')).toBe('blocked');
    expect(q(root, '#paywall').getAttribute('data-e9-state')).toBe('allowed');
  });

  it('flips the page when a Level 1 identity is stored, and back on logout', async () => {
    const root = html(PAGE);
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, {
      sub: `${DOMAIN}:reader`,
      level: 1,
      profile: { given_name: 'Alex', email: 'alex@example.com' },
    });
    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    bindContent(id, { root });

    setPageUrl(`/article#delegate_token=${token}`);
    await id.handleCallback();

    expect(q(root, '#story').hidden).toBe(false);
    expect(q(root, '#hello').hidden).toBe(false);
    expect(q(root, '#hello span').textContent).toBe('Alex');
    expect(q(root, '#paywall').hidden).toBe(true);
    expect(q(root, '#mfa').hidden).toBe(true);
    expect(q(root, '#login').hidden).toBe(true);
    expect(q(root, '#login2').hidden).toBe(false); // asks for Level 2
    expect(q(root, '#logout').hidden).toBe(false);
    expect(q(root, '#lvl').textContent).toBe('1');
    expect(q(root, '#lvlname').textContent).toBe('Provided');

    id.logout();
    expect(q(root, '#story').hidden).toBe(true);
    expect(q(root, '#paywall').hidden).toBe(false);
    expect(q(root, '#hello span').textContent).toBe('friend');
    expect(q(root, '#logout').hidden).toBe(true);
  });

  it('login buttons call requestIdentity with their level, fields, and prompt', () => {
    const root = html(PAGE + '<button id="pick" data-e9-login data-e9-prompt="select">Switch</button>');
    const id = createEngine9Id({ domain: DOMAIN, storage: 'memory' });
    const request = vi
      .spyOn(id, 'requestIdentity')
      .mockResolvedValue(undefined as unknown as void);
    bindContent(id, { root, fields: ['email'] });

    q(root, '#login').click();
    expect(request).toHaveBeenLastCalledWith({
      minLevel: 1,
      fields: ['email'],
      prompt: undefined,
      mode: 'popup',
    });

    q(root, '#login2').click();
    expect(request).toHaveBeenLastCalledWith({
      minLevel: 2,
      fields: ['given_name', 'email'],
      prompt: undefined,
      mode: 'popup',
    });

    q(root, '#pick').click();
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({ minLevel: 1, prompt: 'select' }),
    );
  });

  it('reports login errors through onError and logout buttons clear identity', async () => {
    const root = html(PAGE);
    const id = createEngine9Id({ domain: DOMAIN, storage: 'memory' });
    vi.spyOn(id, 'requestIdentity').mockRejectedValue(new Error('access_denied'));
    const logout = vi.spyOn(id, 'logout');
    const onError = vi.fn();
    bindContent(id, { root, onError });

    q(root, '#login').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'access_denied' }));

    q(root, '#logout').click();
    expect(logout).toHaveBeenCalledWith({ delegate: false });
  });

  it('unbind stops updating', async () => {
    const root = html(PAGE);
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:x`, level: 1 });
    const id = createEngine9Id({
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    const binding = bindContent(id, { root });
    binding.unbind();
    setPageUrl(`/article#delegate_token=${token}`);
    await id.handleCallback();
    expect(q(root, '#story').hidden).toBe(true);
  });
});

describe('mount', () => {
  it('handles the callback, updates the page, and exposes the client', async () => {
    const root = html(
      '<article id="story" data-e9-min-level="1" hidden>Full story</article>' +
        '<div id="paywall" data-e9-max-level="0">Teaser</div>',
    );
    const keys = await createTestKeys();
    const token = await signIdentityToken(keys, { sub: `${DOMAIN}:mounted`, level: 1 });
    setPageUrl(`/article#delegate_token=${token}`);

    const id = mount({
      root,
      delegateUrl: ISSUER,
      domain: DOMAIN,
      storage: 'memory',
      fetchImpl: mockDelegateFetch(keys.jwk),
    });
    // Before the token is verified the page is in its anonymous state.
    expect(q(root, '#story').hidden).toBe(true);

    const identity = await id.ready;
    expect(identity?.sub).toBe(`${DOMAIN}:mounted`);
    expect(id.level).toBe(1);
    expect(id.isAnonymous).toBe(true); // no profile shared on this token
    expect(q(root, '#story').hidden).toBe(false);
    expect(q(root, '#paywall').hidden).toBe(true);
    expect(location.hash).not.toContain('delegate_token');

    const onBlock = vi.fn();
    id.gate({ minLevel: 2, onBlock });
    expect(onBlock).toHaveBeenCalledTimes(1);
    id.unmount();
  });

  it('reports a callback error and still resolves ready', async () => {
    const root = html('<div id="paywall" data-e9-max-level="0">Teaser</div>');
    setPageUrl('/article?error=access_denied&state=s');
    const onError = vi.fn();
    const id = mount({ root, domain: DOMAIN, storage: 'memory', onError });
    expect(await id.ready).toBeNull();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'access_denied' }));
    expect(q(root, '#paywall').hidden).toBe(false);
    id.unmount();
  });
});
