/**
 * Declarative content gates for pages with no server code.
 *
 * `mount()` creates the client, finishes a login callback, and keeps
 * `data-e9-*` elements in sync with the stored identity. Everything here is
 * soft: it hides and shows markup that is already in the page. Anyone who can
 * open devtools can read it. Use it for teasers, greetings, and
 * "log in to keep reading" layouts, not for secrets.
 */

import { createEngine9Id } from './client';
import { describeLevel, meetsGate, meetsLevel, type ContentGate } from './levels';
import type {
  Engine9Id,
  Engine9IdConfig,
  Identity,
  IdentityMode,
  Prompt,
} from './types';

export const CONTENT_ATTRIBUTES = {
  /** Show only when `identity.level >= n`. */
  minLevel: 'data-e9-min-level',
  /** Show only when `identity.level <= n` (teasers, paywall prompts). */
  maxLevel: 'data-e9-max-level',
  /** Show only when `identity.auth.two_factor` is true. */
  twoFactor: 'data-e9-two-factor',
  /** Click starts login. Optional value is the minimum Level (default 1). */
  login: 'data-e9-login',
  /** Click clears the stored identity. Value `delegate` also ends the delegate session. */
  logout: 'data-e9-logout',
  /** Comma-separated Profile fields a login button requests. */
  fields: 'data-e9-fields',
  /** `prompt` a login button sends (`select` forces the Profile chooser). */
  prompt: 'data-e9-prompt',
  /** Replace text with a Profile field (`given_name`, `email`, …). */
  profile: 'data-e9-profile',
  /** Replace text with the Level number, or its name when the value is `name`. */
  level: 'data-e9-level',
  /** Written by the library: `allowed` or `blocked`. Useful for CSS. */
  state: 'data-e9-state',
} as const;

const GATE_SELECTOR = [
  `[${CONTENT_ATTRIBUTES.minLevel}]`,
  `[${CONTENT_ATTRIBUTES.maxLevel}]`,
  `[${CONTENT_ATTRIBUTES.twoFactor}]`,
].join(',');

export interface BindContentOptions {
  /** Where to look for `data-e9-*` elements. Default `document`. */
  root?: Document | Element;
  /** Level a bare `data-e9-login` asks for. Default `1`. */
  minLevel?: number;
  /** Profile fields a login button requests when it has no `data-e9-fields`. */
  fields?: string[];
  /** `popup` (default) or `redirect`. Popup falls back to redirect when blocked. */
  mode?: IdentityMode;
  /** Default `prompt` for login buttons. */
  prompt?: Prompt;
  /** Called when login fails or a callback carries `error=`. Default `console.warn`. */
  onError?: (error: unknown) => void;
}

export interface ContentBinding {
  /** Re-read the stored identity and update every `data-e9-*` element. */
  apply(): void;
  /** Stop listening for clicks and identity changes. */
  unbind(): void;
}

function parseLevel(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

function parseFields(raw: string | null): string[] | undefined {
  if (raw === null || raw.trim() === '') return undefined;
  const fields = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return fields.length ? fields : undefined;
}

function parsePrompt(raw: string | null): Prompt | undefined {
  if (raw === 'none' || raw === 'select' || raw === 'consent' || raw === 'login') {
    return raw;
  }
  return undefined;
}

/** Read `data-e9-min-level` / `data-e9-max-level` / `data-e9-two-factor`. */
export function gateFromElement(el: Element): ContentGate | null {
  const gate: ContentGate = {};
  let any = false;
  const min = parseLevel(el.getAttribute(CONTENT_ATTRIBUTES.minLevel));
  if (min !== undefined) {
    gate.minLevel = min;
    any = true;
  }
  const max = parseLevel(el.getAttribute(CONTENT_ATTRIBUTES.maxLevel));
  if (max !== undefined) {
    gate.maxLevel = max;
    any = true;
  }
  if (el.hasAttribute(CONTENT_ATTRIBUTES.twoFactor)) {
    gate.twoFactor = el.getAttribute(CONTENT_ATTRIBUTES.twoFactor) !== 'false';
    any = true;
  }
  return any ? gate : null;
}

function setVisible(el: Element, allowed: boolean): void {
  if (el instanceof HTMLElement) el.hidden = !allowed;
  el.setAttribute(CONTENT_ATTRIBUTES.state, allowed ? 'allowed' : 'blocked');
}

function defaultOnError(error: unknown): void {
  if (typeof console !== 'undefined') console.warn('[engine9/id]', error);
}

/**
 * Keep `data-e9-*` elements under `root` in sync with `id`. Returns a binding
 * with `apply()` (re-scan) and `unbind()`.
 */
export function bindContent(
  id: Engine9Id,
  options: BindContentOptions = {},
): ContentBinding {
  const root: Document | Element | undefined =
    options.root ?? (typeof document !== 'undefined' ? document : undefined);
  const onError = options.onError ?? defaultOnError;
  const originalText = new WeakMap<Element, string>();

  const apply = (): void => {
    if (!root) return;
    const identity = id.getIdentity();

    for (const el of Array.from(root.querySelectorAll(GATE_SELECTOR))) {
      setVisible(el, meetsGate(gateFromElement(el), identity));
    }

    for (const el of Array.from(root.querySelectorAll(`[${CONTENT_ATTRIBUTES.login}]`))) {
      if (gateFromElement(el)) continue; // explicit gate wins
      const level = parseLevel(el.getAttribute(CONTENT_ATTRIBUTES.login)) ?? options.minLevel ?? 1;
      setVisible(el, !meetsLevel(identity, level));
    }

    for (const el of Array.from(root.querySelectorAll(`[${CONTENT_ATTRIBUTES.logout}]`))) {
      if (gateFromElement(el)) continue;
      setVisible(el, !id.isAnonymous);
    }

    for (const el of Array.from(root.querySelectorAll(`[${CONTENT_ATTRIBUTES.profile}]`))) {
      const field = el.getAttribute(CONTENT_ATTRIBUTES.profile) ?? '';
      if (!originalText.has(el)) originalText.set(el, el.textContent ?? '');
      const value = (identity?.profile as Record<string, unknown> | undefined)?.[field];
      el.textContent =
        typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : originalText.get(el) ?? '';
    }

    for (const el of Array.from(root.querySelectorAll(`[${CONTENT_ATTRIBUTES.level}]`))) {
      const level = identity?.level ?? 0;
      el.textContent =
        el.getAttribute(CONTENT_ATTRIBUTES.level) === 'name'
          ? describeLevel(level).name
          : String(level);
    }
  };

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const loginEl = target.closest(`[${CONTENT_ATTRIBUTES.login}]`);
    if (loginEl) {
      event.preventDefault();
      const minLevel =
        parseLevel(loginEl.getAttribute(CONTENT_ATTRIBUTES.login)) ?? options.minLevel ?? 1;
      const fields = parseFields(loginEl.getAttribute(CONTENT_ATTRIBUTES.fields)) ?? options.fields;
      const prompt = parsePrompt(loginEl.getAttribute(CONTENT_ATTRIBUTES.prompt)) ?? options.prompt;
      id.requestIdentity({
        minLevel,
        fields,
        prompt,
        mode: options.mode ?? 'popup',
      }).catch(onError);
      return;
    }

    const logoutEl = target.closest(`[${CONTENT_ATTRIBUTES.logout}]`);
    if (logoutEl) {
      event.preventDefault();
      id.logout({ delegate: logoutEl.getAttribute(CONTENT_ATTRIBUTES.logout) === 'delegate' });
    }
  };

  root?.addEventListener('click', onClick);
  const unsubscribe = id.onChange(apply);

  let onReady: (() => void) | undefined;
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    onReady = () => apply();
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  }

  apply();

  return {
    apply,
    unbind() {
      root?.removeEventListener('click', onClick);
      unsubscribe();
      if (onReady) document.removeEventListener('DOMContentLoaded', onReady);
    },
  };
}

export interface MountOptions extends Engine9IdConfig, BindContentOptions {}

export interface MountedEngine9Id extends Engine9Id {
  /** Resolves after the login callback (if any) is verified and the page is updated. */
  ready: Promise<Identity | null>;
  /** Re-scan the page (after inserting new `data-e9-*` markup). */
  apply(): void;
  /** Remove listeners. */
  unmount(): void;
}

/**
 * One call for a page with no server: create the client, finish a login
 * callback, and bind `data-e9-*` elements. Storage defaults to `local` so a
 * login carries across tabs until the token expires.
 */
export function mount(options: MountOptions = {}): MountedEngine9Id {
  const { root, minLevel, fields, mode, prompt, onError, ...config } = options;
  const id = createEngine9Id({ storage: 'local', ...config });
  const binding = bindContent(id, { root, minLevel, fields, mode, prompt, onError });
  const report = onError ?? defaultOnError;

  const ready = id
    .handleCallback()
    .catch((error: unknown) => {
      report(error);
      return null;
    })
    .then((identity) => {
      binding.apply();
      return identity;
    });

  return {
    getDomainUnid: () => id.getDomainUnid(),
    getIdentity: () => id.getIdentity(),
    requestIdentity: (opts) => id.requestIdentity(opts),
    handleCallback: () => id.handleCallback(),
    ensureLevel: (n, opts) => id.ensureLevel(n, opts),
    logout: (opts) => id.logout(opts),
    onChange: (cb) => id.onChange(cb),
    gate: (opts) => id.gate(opts),
    get level() {
      return id.level;
    },
    get isAnonymous() {
      return id.isAnonymous;
    },
    core: id.core,
    ready,
    apply: binding.apply,
    unmount: binding.unbind,
  };
}
