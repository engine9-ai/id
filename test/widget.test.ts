import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Engine9Id, Identity } from '../src/types';
import { loginWidget, type LoginWidget } from '../src/widget';

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    sub: 'site.example:abc',
    level: 3,
    exp: Math.floor(Date.now() / 1000) + 3600,
    fields: { email: 'alex@example.com', display_name: 'Alex' },
    auth: { two_factor: false },
    ...overrides,
  };
}

/** A client whose popups resolve immediately with `next`. */
function fakeId(initial: Identity | null = null) {
  let current = initial;
  const listeners = new Set<(i: Identity | null) => void>();
  const set = (next: Identity | null) => {
    current = next;
    for (const cb of listeners) cb(next);
  };
  const id = {
    getIdentity: () => current,
    getToken: () => (current ? 'jwt-token' : null),
    requestIdentity: vi.fn(async () => {
      set(identity());
      return current!;
    }),
    changeDelegateInfo: vi.fn(async () => {
      set(identity({ fields: { email: 'work@example.com' } }));
      return current!;
    }),
    logout: vi.fn(async () => set(null)),
    onChange: (cb: (i: Identity | null) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    handleCallback: vi.fn(async () => null),
  };
  return id as typeof id & Engine9Id;
}

const ROLES = [
  { id: 'vip', name: 'VIP', requiredAuth: { minLevel: 1 } },
  { id: 'admin', name: 'Admin', requiredAuth: { minLevel: 3 } },
];

let widget: LoginWidget | undefined;

function parts(w: LoginWidget) {
  const root = w.element.shadowRoot!;
  return {
    trigger: root.querySelector<HTMLButtonElement>('.trigger')!,
    dialog: root.querySelector<HTMLDialogElement>('dialog')!,
    action: (name: string) => root.querySelector<HTMLElement>(`[data-action="${name}"]`),
    role: (id: string) => root.querySelector<HTMLButtonElement>(`[data-role="${id}"]`)!,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  widget?.destroy();
  widget = undefined;
  document.body.innerHTML = '';
});

describe('loginWidget', () => {
  it('shows Login when no one is logged in, and the email and role when someone is', () => {
    document.body.innerHTML = '<div id="slot"></div>';
    const signedOut = loginWidget({ id: fakeId(), target: '#slot' });
    expect(parts(signedOut).trigger.textContent).toBe('Login');
    expect(document.querySelector('#slot .e9-login-widget')).toBe(signedOut.element);
    signedOut.destroy();

    widget = loginWidget({ id: fakeId(identity()), target: '#slot', roles: ROLES, role: 'vip' });
    const { trigger } = parts(widget);
    expect(trigger.querySelector('.who')?.textContent).toBe('alex@example.com');
    expect(trigger.querySelector('.pill')?.textContent).toBe('VIP');
  });

  it('logs in from the dialog and keeps it open to pick a role', async () => {
    const id = fakeId();
    const onLogin = vi.fn();
    widget = loginWidget({ id, roles: ROLES, onLogin, fields: ['email'], loginLevel: 2 });
    const p = parts(widget);
    p.trigger.click();
    expect(p.dialog.hasAttribute('open')).toBe(true);
    expect(p.dialog.textContent).toContain('asks Delegate for your email address');
    expect(p.action('login')?.textContent).toBe('Log in with Google or email');

    p.action('login')!.click();
    await settle();
    expect(id.requestIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ minLevel: 1, fields: ['email'], loginLevel: 2, mode: 'popup' }),
    );
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ level: 3 }), 'jwt-token');
    expect(p.dialog.hasAttribute('open')).toBe(true);
    expect(p.dialog.textContent).toContain('Choose a role');
  });

  it('closes after login when there is no role to pick', async () => {
    widget = loginWidget({ id: fakeId() });
    const p = parts(widget);
    p.trigger.click();
    p.action('login')!.click();
    await settle();
    expect(p.dialog.hasAttribute('open')).toBe(false);
    expect(p.trigger.textContent).toBe('alex@example.com');
  });

  it('switches email through changeDelegateInfo and reports the new address', async () => {
    const id = fakeId(identity());
    widget = loginWidget({ id, minLevel: 2 });
    const p = parts(widget);
    p.trigger.click();
    p.action('switch-email')!.click();
    await settle();
    expect(id.changeDelegateInfo).toHaveBeenCalledWith(
      expect.objectContaining({ minLevel: 2, mode: 'popup' }),
    );
    expect(p.dialog.querySelector('.status')?.textContent).toContain('now sees work@example.com');
    expect(p.trigger.textContent).toBe('work@example.com');
  });

  it('locks roles the Level does not meet and calls onRoleChange for the rest', async () => {
    const onRoleChange = vi.fn();
    widget = loginWidget({ id: fakeId(identity({ level: 2 })), roles: ROLES, onRoleChange });
    const p = parts(widget);
    p.trigger.click();
    expect(p.role('admin').disabled).toBe(true);
    expect(p.role('admin').textContent).toContain('Needs Level 3');

    p.role('vip').click();
    await settle();
    expect(onRoleChange).toHaveBeenCalledWith('vip', expect.objectContaining({ user: null }));
    expect(p.role('vip').getAttribute('aria-pressed')).toBe('true');
    expect(p.trigger.querySelector('.pill')?.textContent).toBe('VIP');
  });

  it('shows the error and keeps the role when onRoleChange throws', async () => {
    const onError = vi.fn();
    widget = loginWidget({
      id: fakeId(identity()),
      roles: ROLES,
      onError,
      onRoleChange: () => Promise.reject(new Error('Server said no')),
    });
    const p = parts(widget);
    p.trigger.click();
    p.role('vip').click();
    await settle();
    expect(onError).toHaveBeenCalled();
    expect(p.dialog.querySelector('.status.err')?.textContent).toBe('Server said no');
    expect(p.role('vip').getAttribute('aria-pressed')).toBe('false');
  });

  it('logs out of this site only by default', async () => {
    const id = fakeId(identity());
    widget = loginWidget({ id });
    const p = parts(widget);
    p.trigger.click();
    expect(p.action('logout-delegate')).toBeNull();
    p.action('logout')!.click();
    await settle();
    expect(id.logout).toHaveBeenCalledWith({ delegate: false, mode: 'popup' });
  });

  it('logs out, asking whether to end the Delegate session too', async () => {
    const id = fakeId(identity());
    const onLogout = vi.fn();
    widget = loginWidget({ id, onLogout, logoutDelegate: 'ask' });
    const p = parts(widget);
    p.trigger.click();
    const box = p.action('logout-delegate') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    p.action('logout')!.click();
    await settle();
    expect(id.logout).toHaveBeenCalledWith({ delegate: true, mode: 'popup' });
    expect(onLogout).toHaveBeenCalled();
    expect(p.trigger.textContent).toBe('Login');
  });

  it('uses the site session user when one is given', async () => {
    const id = fakeId();
    widget = loginWidget({
      id,
      roles: ROLES,
      user: { email: 'member@example.com', role: 'admin', level: 3 },
      onLogin: () => ({ email: 'server@example.com', level: 3, role: null }),
    });
    const p = parts(widget);
    expect(p.trigger.querySelector('.who')?.textContent).toBe('member@example.com');
    expect(p.trigger.querySelector('.pill')?.textContent).toBe('Admin');
    p.trigger.click();
    expect(p.action('logout-delegate')).toBeNull();

    p.action('logout')!.click();
    await settle();
    expect(id.logout).toHaveBeenCalledWith({ delegate: false, mode: 'popup' });
    expect(p.trigger.textContent).toBe('Login');

    p.trigger.click();
    p.action('login')!.click();
    await settle();
    expect(p.trigger.querySelector('.who')?.textContent).toBe('server@example.com');
    expect(p.dialog.textContent).toContain('Choose a role');
  });

  it('drops the Delegate branding and relabels on request', () => {
    widget = loginWidget({
      id: fakeId(),
      branding: false,
      siteName: 'Solstice Wave',
      labels: { login: 'Sign in', title: 'Welcome to {site}' },
    });
    const p = parts(widget);
    p.trigger.click();
    expect(p.trigger.textContent).toBe('Sign in');
    expect(p.dialog.querySelector('h2')?.textContent).toBe('Welcome to Solstice Wave');
    expect(p.dialog.querySelector('.brand')).toBeNull();
    expect(p.dialog.querySelector('.foot')).toBeNull();
  });

  it('escapes values from the identity', () => {
    widget = loginWidget({ id: fakeId(identity({ fields: { email: '<img src=x>' } })) });
    expect(parts(widget).trigger.innerHTML).toContain('&lt;img src=x&gt;');
  });
});
