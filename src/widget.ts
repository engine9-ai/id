/**
 * Login widget: one button and one dialog for every Delegate step.
 *
 * The button shows who is logged in (email and role) or "Login". The dialog
 * logs in with Google, switches the shared email address, changes the site's
 * role, and logs out, all on the page. Delegate's own windows still open as
 * popups (Google sign-in, the address chooser, Delegate logout); the dialog
 * stays open behind them and updates when they answer.
 *
 * It reuses `requestIdentity`, `changeDelegateInfo`, and `logout`. Roles are
 * the site's: the widget lists them and calls `onRoleChange`.
 */

import { createEngine9Id } from './client';
import { DelegateIdentityError, insecureDomainMessage } from './errors';
import { describeLevel } from './levels';
import { meetsRequiredAuth, type DeclaredRoleRegistry, type RequiredAuth } from './roles';
import type { Engine9Id, Engine9IdConfig, Identity } from './types';
import { DEFAULT_DELEGATE_URL } from './types';
import { isInsecureUrl, trimSlash } from './url';

export interface LoginWidgetRole {
  id: string;
  name: string;
  /** One line under the role's name. */
  description?: string;
  /** Roles the visitor's Level does not meet are shown but cannot be picked. */
  requiredAuth?: RequiredAuth;
}

/**
 * Who the site says is logged in. Pass it when the site keeps its own session
 * (a server cookie) that outlives the Identity Token.
 */
export interface LoginWidgetUser {
  email?: string | null;
  name?: string | null;
  /** Current role id (one of `roles`). */
  role?: string | null;
  level?: number;
  twoFactor?: boolean;
}

export interface LoginWidgetLabels {
  /** Button text when no one is logged in. */
  login: string;
  /** `{site}` is replaced with `siteName`. */
  title: string;
  signedInTitle: string;
  google: string;
  /** Login button text when `loginLevel` is 2 (Delegate also offers an email link). */
  googleOrEmail: string;
  switchEmail: string;
  role: string;
  chooseRole: string;
  logout: string;
  logoutDelegate: string;
}

export interface LoginWidgetContext {
  identity: Identity | null;
  user: LoginWidgetUser | null;
}

export interface LoginWidgetOptions extends Engine9IdConfig {
  /** Client to use (from `createEngine9Id` or `mount`). Default: a new one from these options, `local` storage. */
  id?: Engine9Id;
  /** Element or selector the button goes in. Default `[data-e9-login-widget]`, else `document.body`. */
  target?: Element | string;
  /** Level a login asks for. Default `1`. */
  minLevel?: number;
  maxLevel?: number;
  /** Required fields a login asks for. Default: Delegate's (`display_name`, `email`). */
  fields?: string[];
  optionalFields?: string[];
  /** Show the Delegate mark and footer. Default `true`. */
  branding?: boolean;
  /** Name in the dialog title. Default `location.hostname`. */
  siteName?: string;
  labels?: Partial<LoginWidgetLabels>;
  /** `auto` (default) follows `prefers-color-scheme`. */
  theme?: 'auto' | 'light' | 'dark';
  /** Roles the visitor can switch between. No roles hides the Role section. */
  roles?: LoginWidgetRole[] | DeclaredRoleRegistry;
  /** Current role id. */
  role?: string | null;
  /**
   * The site's own record of who is logged in. When set (even to `null`),
   * the button shows this instead of the stored identity.
   */
  user?: LoginWidgetUser | null;
  /**
   * After Delegate returns an identity (login or email switch). A site with a
   * server session sends `token` to its server here; return the new user to show.
   */
  onLogin?(
    identity: Identity,
    token: string | null,
  ): void | LoginWidgetUser | Promise<void | LoginWidgetUser>;
  /** The visitor picked a role. Throw to refuse; the error is shown in the dialog. */
  onRoleChange?(roleId: string, ctx: LoginWidgetContext): void | Promise<void>;
  /**
   * Log out was clicked (a site with a server session ends it here). Runs
   * alongside Delegate logout; use `fetch(…, { keepalive: true })` if it can
   * race a navigation.
   */
  onLogout?(): void | Promise<void>;
  /**
   * End the Delegate session too on Log out. `false` (default) logs out of
   * this site only; `ask` shows a checkbox; `true` always. Delegate logout
   * opens a small popup; the page does not navigate.
   */
  logoutDelegate?: boolean | 'ask';
  /** Called with every error the dialog shows. Default `console.warn`. */
  onError?(error: unknown): void;
}

export interface LoginWidget {
  /**
   * The element holding the button (its shadow root holds the dialog). It
   * carries `data-state` (`signed-in` / `signed-out`) and `data-role`, and
   * exposes `::part(button)`, `::part(email)`, `::part(role)`, and `::part(dialog)`.
   */
  readonly element: HTMLElement;
  readonly id: Engine9Id;
  open(): void;
  close(): void;
  /** Tell the widget about a change the site made (new session user or role). */
  update(state: { user?: LoginWidgetUser | null; role?: string | null }): void;
  destroy(): void;
}

const DEFAULT_LABELS: LoginWidgetLabels = {
  login: 'Login',
  title: 'Log in to {site}',
  signedInTitle: 'Signed in to {site}',
  google: 'Log in with Google',
  googleOrEmail: 'Log in with Google or email',
  switchEmail: 'Switch email',
  role: 'Role',
  chooseRole: 'Choose a role',
  logout: 'Log out',
  logoutDelegate: 'Also sign out of Delegate in this browser',
};

const FIELD_NAMES: Record<string, string> = {
  display_name: 'name',
  given_name: 'first name',
  family_name: 'last name',
  email: 'email address',
  phone: 'phone number',
  attributes: 'profile attributes',
};

const GOOGLE_ICON =
  '<svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

const DELEGATE_MARK =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#1a73e8"/><path d="M8 6.5h3.6a5.5 5.5 0 0 1 0 11H8z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>';

const CSS = `
:host {
  --e9-accent: #1a73e8; --e9-accent-fg: #fff;
  --e9-bg: #fff; --e9-fg: #1a1f36; --e9-muted: #5b6275;
  --e9-border: #e3e6ef; --e9-surface: #f3f5fa; --e9-danger: #b42318;
  --e9-font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: inline-block;
}
:host([data-theme="dark"]) {
  --e9-bg: #161a23; --e9-fg: #eef1f7; --e9-muted: #a3aabb;
  --e9-border: #2c3242; --e9-surface: #202533; --e9-danger: #f97066;
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) {
    --e9-bg: #161a23; --e9-fg: #eef1f7; --e9-muted: #a3aabb;
    --e9-border: #2c3242; --e9-surface: #202533; --e9-danger: #f97066;
  }
}
button { font: inherit; cursor: pointer; }
button:disabled { cursor: default; opacity: .55; }
.trigger {
  display: inline-flex; align-items: center; gap: .5em; max-width: 22em;
  padding: .45em 1em; border-radius: 999px; border: 1px solid var(--e9-border);
  background: var(--e9-bg); color: var(--e9-fg);
}
.trigger:hover { background: var(--e9-surface); }
.trigger .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill {
  flex: none; font-size: .72em; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  padding: .15em .55em; border-radius: 999px; background: var(--e9-surface); color: var(--e9-muted);
}
dialog {
  box-sizing: border-box; width: min(380px, calc(100vw - 32px)); padding: 18px 20px 16px;
  border: 1px solid var(--e9-border); border-radius: 16px;
  background: var(--e9-bg); color: var(--e9-fg); font: var(--e9-font);
  box-shadow: 0 24px 64px rgba(10, 14, 30, .28);
}
dialog::backdrop { background: rgba(10, 14, 30, .45); }
.top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
.x {
  margin-left: auto; width: 30px; height: 30px; border: 0; border-radius: 8px;
  background: transparent; color: var(--e9-muted); font-size: 20px; line-height: 1;
}
.x:hover { background: var(--e9-surface); }
h2 { margin: 4px 0 10px; font-size: 1.15em; }
h3 { margin: 0 0 6px; font-size: .78em; letter-spacing: .06em; text-transform: uppercase; color: var(--e9-muted); }
p { margin: 0 0 10px; }
.muted { color: var(--e9-muted); }
.fine { font-size: .85em; color: var(--e9-muted); margin: 6px 0 0; }
section { padding: 12px 0; border-top: 1px solid var(--e9-border); }
.card { padding: 12px 14px; border-radius: 12px; background: var(--e9-surface); margin-bottom: 12px; }
.card .email { font-weight: 600; overflow-wrap: anywhere; }
.btn {
  box-sizing: border-box; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px; border: 1px solid var(--e9-border);
  background: var(--e9-bg); color: var(--e9-fg); font-weight: 600;
}
.btn:hover:not(:disabled) { background: var(--e9-surface); }
.btn.primary { background: var(--e9-accent); border-color: var(--e9-accent); color: var(--e9-accent-fg); }
.btn.primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--e9-accent); }
.roles { display: grid; gap: 8px; }
.role {
  text-align: left; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--e9-border);
  background: var(--e9-bg); color: var(--e9-fg);
}
.role:hover:not(:disabled) { background: var(--e9-surface); }
.role[aria-pressed="true"] { border-color: var(--e9-accent); box-shadow: inset 0 0 0 1px var(--e9-accent); }
.role .name { font-weight: 600; }
.role .desc { display: block; font-size: .85em; color: var(--e9-muted); }
label.check { display: flex; gap: 8px; align-items: center; font-size: .9em; color: var(--e9-muted); margin-bottom: 10px; }
.status { margin: 10px 0 0; font-size: .9em; min-height: 0; }
.status:empty { display: none; }
.status.err { color: var(--e9-danger); }
.refused {
  padding: 12px 14px; border-radius: 12px; font-weight: 600; color: var(--e9-danger);
  border: 1px solid currentColor; background: var(--e9-surface); overflow-wrap: anywhere;
}
.foot { margin: 12px 0 0; font-size: .8em; color: var(--e9-muted); text-align: center; }
.foot a { color: inherit; }
`;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function listText(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function normalizeRoles(roles: LoginWidgetOptions['roles']): LoginWidgetRole[] {
  if (!roles) return [];
  if (Array.isArray(roles)) return roles;
  return Object.entries(roles).map(([key, role]) => ({ ...role, id: role.id || key }));
}

function resolveTarget(target: LoginWidgetOptions['target']): Element {
  if (target && typeof target !== 'string') return target;
  const found = document.querySelector(target ?? '[data-e9-login-widget]');
  if (found) return found;
  if (typeof target === 'string') {
    throw new DelegateIdentityError('invalid_request', `loginWidget target ${target} is not on the page`);
  }
  return document.body;
}

function defaultOnError(error: unknown): void {
  if (typeof console !== 'undefined') console.warn('[engine9/id]', error);
}

function pickConfig(options: LoginWidgetOptions): Engine9IdConfig {
  const { provider, delegateUrl, domain, storage, core, fetchImpl, debug, loginLevel } = options;
  return { provider, delegateUrl, domain, storage: storage ?? 'local', core, fetchImpl, debug, loginLevel };
}

interface View {
  signedIn: boolean;
  email: string | null;
  level: number;
  twoFactor: boolean;
}

/**
 * Put a Login button on the page that opens the Delegate dialog.
 *
 * ```js
 * const widget = loginWidget({ target: '#login', roles: [{ id: 'vip', name: 'VIP' }] });
 * ```
 */
export function loginWidget(options: LoginWidgetOptions = {}): LoginWidget {
  const ownsClient = !options.id;
  const id = options.id ?? createEngine9Id(pickConfig(options));
  const labels: LoginWidgetLabels = { ...DEFAULT_LABELS, ...options.labels };
  const roles = normalizeRoles(options.roles);
  const onError = options.onError ?? defaultOnError;
  const branding = options.branding !== false;
  const delegateBase = trimSlash(options.delegateUrl ?? DEFAULT_DELEGATE_URL);
  const siteName =
    options.siteName ?? (typeof location !== 'undefined' ? location.hostname : 'this site');
  const insecurePage =
    typeof location !== 'undefined' && isInsecureUrl(location.href) ? location.href : null;
  const minLevel = Math.max(1, options.minLevel ?? 1);
  const request = {
    minLevel,
    maxLevel: options.maxLevel,
    fields: options.fields,
    optionalFields: options.optionalFields,
    loginLevel: options.loginLevel,
    mode: 'popup' as const,
  };

  const state: {
    user: LoginWidgetUser | null | undefined;
    role: string | null;
    busy: string | null;
    status: { text: string; kind: 'ok' | 'err' } | null;
    logoutDelegate: boolean;
  } = {
    user: options.user,
    role: options.role ?? options.user?.role ?? null,
    busy: null,
    status: null,
    logoutDelegate: options.logoutDelegate === true,
  };

  const host = document.createElement('span');
  host.className = 'e9-login-widget';
  host.dataset.theme = options.theme ?? 'auto';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS}</style><button class="trigger" part="button" type="button" aria-haspopup="dialog"></button><dialog part="dialog" aria-labelledby="e9-title"></dialog>`;
  const trigger = shadow.querySelector('.trigger') as HTMLButtonElement;
  const dialog = shadow.querySelector('dialog') as HTMLDialogElement;
  resolveTarget(options.target).appendChild(host);

  const view = (): View => {
    const identity = id.getIdentity();
    if (state.user !== undefined) {
      const user = state.user;
      return {
        signedIn: Boolean(user),
        email: user?.email ?? user?.name ?? null,
        level: user?.level ?? identity?.level ?? 0,
        twoFactor: user?.twoFactor ?? identity?.auth?.two_factor === true,
      };
    }
    const fields = identity?.fields;
    return {
      signedIn: (identity?.level ?? 0) >= 1,
      email: fields?.email ?? fields?.display_name ?? fields?.given_name ?? null,
      level: identity?.level ?? 0,
      twoFactor: identity?.auth?.two_factor === true,
    };
  };

  const currentRole = (): LoginWidgetRole | undefined =>
    state.role ? roles.find((role) => role.id === state.role) : undefined;

  const context = (): LoginWidgetContext => ({
    identity: id.getIdentity(),
    user: state.user ?? null,
  });

  const site = (text: string): string => text.replace(/\{site\}/g, siteName);

  const renderTrigger = (v: View): void => {
    host.dataset.state = v.signedIn ? 'signed-in' : 'signed-out';
    host.dataset.role = v.signedIn ? state.role ?? '' : '';
    if (!v.signedIn) {
      trigger.innerHTML = esc(labels.login);
      trigger.title = '';
      return;
    }
    const role = currentRole();
    const roleName = role?.name ?? state.role;
    trigger.innerHTML =
      `<span class="who" part="email">${esc(v.email ?? 'Signed in')}</span>` +
      (roleName ? `<span class="pill" part="role">${esc(roleName)}</span>` : '');
    trigger.title = [v.email, roleName, `Level ${v.level}`].filter(Boolean).join(' · ');
  };

  const signedOutBody = (): string => {
    if (insecurePage) {
      return `<p class="refused" role="alert">${esc(insecureDomainMessage(insecurePage))}</p>`;
    }
    const asked = (options.fields ?? ['display_name', 'email']).map((f) => FIELD_NAMES[f] ?? f);
    const level = describeLevel(minLevel);
    const loginText = options.loginLevel === 2 ? labels.googleOrEmail : labels.google;
    return (
      `<p class="muted">${esc(siteName)} asks Delegate for your ${esc(listText(asked))}` +
      (minLevel >= 2 ? ` at Level ${minLevel} (${esc(level.name)})` : '') +
      `.</p>` +
      `<button class="btn primary" type="button" data-action="login">${options.loginLevel === 2 ? '' : GOOGLE_ICON}<span>${esc(loginText)}</span></button>` +
      `<p class="fine">Delegate opens a window to sign you in, then brings you back here.</p>`
    );
  };

  const rolesSection = (v: View): string => {
    if (!roles.length) return '';
    const items = roles
      .map((role) => {
        const allowed = meetsRequiredAuth(role.requiredAuth, {
          level: v.level,
          auth: { two_factor: v.twoFactor },
        });
        const needs = role.requiredAuth?.minLevel;
        const note = allowed
          ? role.description
          : `Needs Level ${needs ?? '?'}${role.requiredAuth?.twoFactor ? ' with two-factor sign-in' : ''}`;
        const pressed = role.id === state.role;
        return (
          `<button class="role" type="button" data-action="role" data-role="${esc(role.id)}" aria-pressed="${pressed}"${allowed ? '' : ' disabled'}>` +
          `<span class="name">${esc(role.name)}</span>` +
          (note ? `<span class="desc">${esc(note)}</span>` : '') +
          `</button>`
        );
      })
      .join('');
    return `<section><h3>${esc(state.role ? labels.role : labels.chooseRole)}</h3><div class="roles">${items}</div></section>`;
  };

  const signedInBody = (v: View): string => {
    const level = describeLevel(v.level);
    const role = currentRole();
    const below = v.level < minLevel;
    const ask = options.logoutDelegate === 'ask';
    return (
      `<div class="card"><div class="email">${esc(v.email ?? 'Signed in')}</div>` +
      `<div class="fine">Level ${v.level} · ${esc(level.name)}${role ? ` · ${esc(role.name)}` : ''}</div></div>` +
      (below
        ? `<p class="muted">${esc(siteName)} needs Level ${minLevel} (${esc(describeLevel(minLevel).name)}).</p>` +
          `<button class="btn primary" type="button" data-action="login"><span>Confirm with Delegate</span></button>`
        : '') +
      `<section><h3>Email</h3>` +
      `<button class="btn" type="button" data-action="switch-email">${esc(labels.switchEmail)}</button>` +
      `<p class="fine">Pick another address, add one, or use a different Google account.</p></section>` +
      rolesSection(v) +
      `<section>` +
      (ask
        ? `<label class="check"><input type="checkbox" data-action="logout-delegate"${state.logoutDelegate ? ' checked' : ''}> ${esc(labels.logoutDelegate)}</label>`
        : '') +
      `<button class="btn" type="button" data-action="logout">${esc(labels.logout)}</button></section>`
    );
  };

  const render = (): void => {
    const v = view();
    renderTrigger(v);
    const title = site(v.signedIn ? labels.signedInTitle : labels.title);
    const top = branding
      ? `<span class="brand">${DELEGATE_MARK}<span>Delegate</span></span>`
      : '';
    const foot = branding
      ? `<p class="foot">Sign-in by <a href="${esc(delegateBase)}" target="_blank" rel="noreferrer">Delegate</a></p>`
      : '';
    dialog.innerHTML =
      `<div class="top">${top}<button class="x" type="button" data-action="close" aria-label="Close">×</button></div>` +
      `<h2 id="e9-title">${esc(title)}</h2>` +
      (v.signedIn ? signedInBody(v) : signedOutBody()) +
      `<p class="status${state.status?.kind === 'err' ? ' err' : ''}" role="status">${esc(state.busy ?? state.status?.text ?? '')}</p>` +
      foot;
    if (state.busy) {
      for (const el of Array.from(dialog.querySelectorAll('button, input'))) {
        if ((el as HTMLElement).dataset.action !== 'close') (el as HTMLButtonElement).disabled = true;
      }
    }
  };

  const describeError = (error: unknown): string => {
    const code = error instanceof DelegateIdentityError ? error.code : undefined;
    if (code === 'insecure_domain') {
      const href = insecurePage ?? (typeof location !== 'undefined' ? location.href : '');
      return href ? insecureDomainMessage(href) : 'Login is not available because the connection is not secure.';
    }
    if (code === 'access_denied') return 'The Delegate window closed before it finished. Try again when you are ready.';
    if (code === 'level_unavailable') return `Delegate did not share what ${siteName} needs, so you are not logged in.`;
    if (code === 'invalid_domain') return `Delegate does not accept ${siteName} yet. The site operator needs to register it.`;
    return error instanceof Error ? error.message : String(error);
  };

  const run = (busy: string, action: () => Promise<void>): Promise<void> => {
    if (state.busy) return Promise.resolve();
    state.busy = busy;
    state.status = null;
    render();
    let pending: Promise<void>;
    try {
      pending = action();
    } catch (error) {
      pending = Promise.reject(error);
    }
    return pending
      .catch((error: unknown) => {
        state.status = { text: describeError(error), kind: 'err' };
        onError(error);
      })
      .finally(() => {
        state.busy = null;
        render();
      });
  };

  const afterIdentity = async (identity: Identity): Promise<void> => {
    const user = await options.onLogin?.(identity, id.getToken());
    if (user && typeof user === 'object') {
      state.user = user;
      if (user.role !== undefined) state.role = user.role ?? null;
    } else if (state.user !== undefined) {
      state.user = {
        email: identity.fields?.email ?? identity.fields?.display_name ?? null,
        level: identity.level,
        twoFactor: identity.auth?.two_factor === true,
        role: state.role,
      };
    }
  };

  const login = (): Promise<void> =>
    run('Waiting for Delegate…', async () => {
      const identity = await id.requestIdentity(request);
      if (!identity) return;
      await afterIdentity(identity);
      if (!roles.length || state.role) close();
    });

  const switchEmail = (): Promise<void> =>
    run('Waiting for Delegate…', async () => {
      const identity = await id.changeDelegateInfo(request);
      if (!identity) return;
      await afterIdentity(identity);
      const email = view().email;
      state.status = { text: email ? `${siteName} now sees ${email}.` : 'Updated.', kind: 'ok' };
    });

  const changeRole = (roleId: string): Promise<void> => {
    if (roleId === state.role) return Promise.resolve();
    const role = roles.find((r) => r.id === roleId);
    return run(`Switching to ${role?.name ?? roleId}…`, async () => {
      await options.onRoleChange?.(roleId, context());
      state.role = roleId;
      if (state.user) state.user = { ...state.user, role: roleId };
    });
  };

  const logout = (): Promise<void> => {
    const delegate =
      options.logoutDelegate === true ||
      (options.logoutDelegate === 'ask' && state.logoutDelegate);
    return run('Logging out…', async () => {
      if (state.user !== undefined) state.user = null;
      state.role = null;
      // Both start inside the click: the site's logout request, and Delegate's
      // logout popup (a popup opened after an await is blocked).
      const site = Promise.resolve(options.onLogout?.());
      const ended = id.logout({ delegate, mode: 'popup' });
      await Promise.all([site, ended]);
      close();
    });
  };

  const isOpen = (): boolean => dialog.open || dialog.hasAttribute('open');

  const open = (): void => {
    render();
    if (isOpen()) return;
    if (typeof dialog.showModal === 'function') {
      try {
        dialog.showModal();
        return;
      } catch {
        // not connected or unsupported: fall back to the attribute
      }
    }
    dialog.setAttribute('open', '');
  };

  function close(): void {
    if (!isOpen()) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    state.status = null;
  }

  const onDialogClick = (event: MouseEvent): void => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (!inside) close();
      return;
    }
    const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!(target instanceof HTMLElement) || target.matches(':disabled')) return;
    switch (target.dataset.action) {
      case 'close':
        close();
        break;
      case 'login':
        void login();
        break;
      case 'switch-email':
        void switchEmail();
        break;
      case 'role':
        if (target.dataset.role) void changeRole(target.dataset.role);
        break;
      case 'logout':
        void logout();
        break;
    }
  };

  const onDialogChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.action === 'logout-delegate') {
      state.logoutDelegate = target.checked;
    }
  };

  trigger.addEventListener('click', open);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('change', onDialogChange);
  const unsubscribe = id.onChange(() => {
    if (!state.busy) render();
  });

  if (ownsClient) {
    void id
      .handleCallback()
      .then((identity) => (identity ? afterIdentity(identity) : undefined))
      .catch(onError)
      .finally(render);
  }
  render();

  return {
    element: host,
    id,
    open,
    close,
    update(next) {
      if (next.user !== undefined) {
        state.user = next.user;
        if (next.user?.role !== undefined) state.role = next.user.role ?? null;
      }
      if (next.role !== undefined) state.role = next.role;
      render();
    },
    destroy() {
      unsubscribe();
      trigger.removeEventListener('click', open);
      dialog.removeEventListener('click', onDialogClick);
      dialog.removeEventListener('change', onDialogChange);
      host.remove();
    },
  };
}
