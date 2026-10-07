import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
import { listenForDelegateIdentity, openLogoutPopup } from '../src/popup';
import { DOMAIN, postMessage } from './helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openLogoutPopup', () => {
  it('resolves when Delegate posts delegate-logout from the popup', async () => {
    const popup = { closed: false, close: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const pending = openLogoutPopup({
      url: 'https://delegate.engine9.ai/identity/logout/bridge?domain=site.example',
      expectedOrigin: 'https://delegate.engine9.ai',
    });
    postMessage('https://evil.example', { type: 'delegate-logout' });
    postMessage('https://delegate.engine9.ai', { type: 'delegate-logout', loggedOut: true });
    await expect(pending).resolves.toBe('loggedOut');
  });

  it('returns null when the popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(
      openLogoutPopup({ url: 'https://delegate.engine9.ai/x', expectedOrigin: 'https://delegate.engine9.ai' }),
    ).resolves.toBeNull();
  });
});

describe('logout', () => {
  it('opens the logout bridge for a popup Delegate logout and clears the identity first', async () => {
    const popup = { closed: false, close: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    const id = createEngine9Id({ domain: DOMAIN, storage: 'memory' });
    const seen: unknown[] = [];
    id.onChange((identity) => seen.push(identity));
    const pending = id.logout({ delegate: true, mode: 'popup' });
    expect(seen).toEqual([null]);
    expect(String(open.mock.calls[0][0])).toBe(
      'https://delegate.engine9.ai/identity/logout/bridge?domain=site.example',
    );
    postMessage('https://delegate.engine9.ai', { type: 'delegate-logout', loggedOut: true });
    await expect(pending).resolves.toBeUndefined();
  });
});

const DELEGATE = 'https://delegate.engine9.ai';

describe('listenForDelegateIdentity', () => {
  it('ignores messages from the wrong origin', async () => {
    const pending = listenForDelegateIdentity({ expectedOrigin: DELEGATE });
    postMessage('https://evil.example', {
      type: 'delegate-identity',
      token: 'evil-token',
    });
    postMessage(DELEGATE, { type: 'delegate-profile', token: 'legacy' });
    postMessage(DELEGATE, { type: 'delegate-identity', token: 'good-token', state: 's' });
    await expect(pending).resolves.toEqual({ token: 'good-token', state: 's' });
  });

  it('ignores non-identity message types from the delegate origin', async () => {
    const pending = listenForDelegateIdentity({ expectedOrigin: DELEGATE });
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    postMessage(DELEGATE, { type: 'delegate-profile', unid: 'u1' });
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    postMessage(DELEGATE, { type: 'delegate-identity', token: 'ok' });
    await expect(pending).resolves.toEqual({ token: 'ok', state: undefined });
  });

  it('rejects with the delegate error code when the bridge reports one', async () => {
    const pending = listenForDelegateIdentity({ expectedOrigin: DELEGATE });
    postMessage('https://evil.example', { type: 'delegate-identity', error: 'access_denied' });
    postMessage(DELEGATE, { type: 'delegate-identity', error: 'level_unavailable', state: 's' });
    await expect(pending).rejects.toMatchObject({
      name: 'DelegateIdentityError',
      code: 'level_unavailable',
      message: expect.stringContaining('did not share the fields'),
      details: { step: 'popup', state: 's' },
    });
  });
});
