import { createCoreClient } from './core';
import { DelegateIdentityError, delegateReturnedError, insecureDomainError } from './errors';
import { meetsGate, meetsLevel } from './levels';
import { createDebugLog } from './log';
import { defaultConfiguration } from './discovery';
import { openIdentityPopup, openLogoutPopup } from './popup';
import { createDelegateProvider } from './provider';
import { randomId } from './random';
import { createStorage, STORAGE_KEYS } from './storage';
import type {
  ChangeDelegateInfoOptions,
  Engine9Id,
  Engine9IdConfig,
  Engine9IdProvider,
  EnsureLevelOptions,
  FetchImpl,
  GateOptions,
  Identity,
  LogoutOptions,
  RequestIdentityOptions,
} from './types';
import { DEFAULT_DELEGATE_URL } from './types';
import {
  domainFromUrl,
  isInsecureUrl,
  parseDelegateCallback,
  stripCallbackParams,
  trimSlash,
} from './url';
import { CLOCK_SKEW_SECONDS } from './verify';

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== 'function') {
    throw new DelegateIdentityError('invalid_request', 'fetch is required');
  }
  return fetch(input, init);
}

function currentDomain(): string {
  if (typeof location === 'undefined') return '';
  return domainFromUrl(location.href) ?? '';
}

function currentHref(): string {
  return typeof location !== 'undefined' ? location.href : '';
}

function isUnexpired(identity: Identity, now = Date.now() / 1000): boolean {
  return typeof identity.exp === 'number' && now <= identity.exp + CLOCK_SKEW_SECONDS;
}

function readStoredIdentity(raw: string | null): Identity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed || typeof parsed.sub !== 'string') return null;
    if (!isUnexpired(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function assignLocation(url: string): void {
  if (typeof location === 'undefined' || typeof location.assign !== 'function') {
    throw new DelegateIdentityError('invalid_request', 'location.assign is not available');
  }
  location.assign(url);
}

function resolveProvider(
  config: Engine9IdConfig,
  fetchImpl: FetchImpl,
): Engine9IdProvider {
  if (config.provider) return config.provider;
  return createDelegateProvider({
    delegateUrl: trimSlash(config.delegateUrl ?? DEFAULT_DELEGATE_URL),
    fetchImpl,
  });
}

export function createEngine9Id(config: Engine9IdConfig = {}): Engine9Id {
  const domain = config.domain ?? currentDomain();
  const storage = createStorage(config.storage ?? 'session');
  const fetchImpl: FetchImpl = config.fetchImpl ?? defaultFetch;
  const provider = resolveProvider(config, fetchImpl);
  const log = createDebugLog(config.debug);
  const listeners = new Set<(identity: Identity | null) => void>();

  const notify = (identity: Identity | null): void => {
    for (const cb of listeners) cb(identity);
  };

  const persist = (identity: Identity, token: string): void => {
    storage.set(STORAGE_KEYS.token, token);
    storage.set(STORAGE_KEYS.identity, JSON.stringify(identity));
    storage.set(STORAGE_KEYS.domainUnid, identity.sub);
    notify(identity);
  };

  const getIdentity = (): Identity | null =>
    readStoredIdentity(storage.get(STORAGE_KEYS.identity));

  const verifyAndStore = async (token: string, nonce?: string): Promise<Identity> => {
    log('verify', { domain, tokenLength: token.length, nonce: Boolean(nonce) });
    let identity: Identity;
    try {
      identity = await provider.verifyToken(token, { domain, nonce });
    } catch (err) {
      log('verify:failed', {
        code: err instanceof DelegateIdentityError ? err.code : undefined,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    log('verify:ok', { level: identity.level, exp: identity.exp });
    persist(identity, token);
    return identity;
  };

  const stateMismatch = (expected: string | null | undefined, received: string | undefined) =>
    new DelegateIdentityError(
      'invalid_request',
      'state mismatch: the Identity Token answers a different request (another tab, or an older popup or redirect). Start the login again.',
      { step: 'state', expected: expected ?? null, received: received ?? null },
    );

  const beginRequest = (): { nonce: string; state: string } => {
    const nonce = randomId();
    const state = randomId();
    storage.set(STORAGE_KEYS.nonce, nonce);
    storage.set(STORAGE_KEYS.state, state);
    return { nonce, state };
  };

  const requestIdentity = async (
    opts: RequestIdentityOptions,
  ): Promise<Identity | void> => {
    if (!domain) {
      throw new DelegateIdentityError('invalid_domain', 'createEngine9Id requires domain');
    }
    const returnTo = opts.returnTo ?? currentHref();
    const insecure = [currentHref(), returnTo].find(isInsecureUrl);
    if (insecure) {
      log('request:insecure', { url: insecure });
      throw insecureDomainError(insecure);
    }
    const { nonce, state } = beginRequest();
    const loginLevel = opts.loginLevel ?? config.loginLevel;
    const expiresIn = opts.expiresIn ?? config.expiresIn;
    log('request', {
      mode: opts.mode,
      domain,
      minLevel: opts.minLevel,
      maxLevel: opts.maxLevel,
      prompt: opts.prompt,
      loginLevel,
      expiresIn,
      fields: opts.fields,
    });
    const shared = {
      domain,
      minLevel: opts.minLevel,
      maxLevel: opts.maxLevel,
      fields: opts.fields,
      optionalFields: opts.optionalFields,
      prompt: opts.prompt,
      loginLevel,
      expiresIn,
      nonce,
      state,
    };

    if (opts.mode === 'redirect') {
      log('redirect', { returnTo });
      assignLocation(
        await provider.buildAuthorizeUrl({
          ...shared,
          returnTo,
          responseMode: opts.responseMode,
        }),
      );
      return;
    }

    if (!provider.buildBridgeUrl) {
      assignLocation(
        await provider.buildAuthorizeUrl({
          ...shared,
          returnTo,
          responseMode: opts.responseMode,
        }),
      );
      return;
    }

    let discovery;
    try {
      discovery = await provider.discover();
    } catch (err) {
      log('discovery:failed', { message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    const popupUrl = await provider.buildBridgeUrl(shared);
    const expectedOrigin = provider.messageOrigin
      ? provider.messageOrigin(discovery)
      : new URL(discovery.issuer).origin;
    log('discovery', { issuer: discovery.issuer, expectedOrigin });
    const message = await openIdentityPopup({
      url: popupUrl,
      expectedOrigin,
      log,
    });
    if (!message) {
      log('popup:fallback_to_redirect', { returnTo });
      assignLocation(
        await provider.buildAuthorizeUrl({
          ...shared,
          returnTo,
          responseMode: opts.responseMode,
        }),
      );
      return;
    }
    if (message.state && message.state !== state) {
      throw stateMismatch(state, message.state);
    }
    storage.remove(STORAGE_KEYS.nonce);
    storage.remove(STORAGE_KEYS.state);
    return verifyAndStore(message.token, nonce);
  };

  const handleCallback = async (): Promise<Identity | null> => {
    const loc =
      typeof location !== 'undefined'
        ? { href: location.href, hash: location.hash, search: location.search }
        : undefined;
    const parsed = parseDelegateCallback(loc);
    if (!parsed) return null;
    log('callback', { error: parsed.error, token: Boolean(parsed.token), state: Boolean(parsed.state) });

    const clean = (): void => {
      if (typeof location === 'undefined' || typeof history === 'undefined') return;
      history.replaceState(history.state, '', stripCallbackParams(location.href));
    };

    try {
      if (parsed.error) {
        throw delegateReturnedError(parsed.error, { step: 'callback', state: parsed.state });
      }
      if (!parsed.token) return null;
      const expectedState = storage.get(STORAGE_KEYS.state);
      if (expectedState && parsed.state !== expectedState) {
        throw stateMismatch(expectedState, parsed.state);
      }
      const nonce = storage.get(STORAGE_KEYS.nonce) ?? undefined;
      const identity = await verifyAndStore(parsed.token, nonce);
      storage.remove(STORAGE_KEYS.nonce);
      storage.remove(STORAGE_KEYS.state);
      return identity;
    } finally {
      clean();
    }
  };

  const ensureLevel = async (
    n: number,
    opts: EnsureLevelOptions = {},
  ): Promise<Identity | void> => {
    const current = getIdentity();
    if (meetsLevel(current, n)) return current ?? undefined;
    const mode = opts.mode ?? 'popup';
    if (!current) {
      try {
        const silent = await requestIdentity({
          minLevel: n,
          maxLevel: opts.maxLevel,
          fields: opts.fields,
          optionalFields: opts.optionalFields,
          mode,
          returnTo: opts.returnTo,
          responseMode: opts.responseMode,
          prompt: 'none',
          loginLevel: opts.loginLevel,
          expiresIn: opts.expiresIn,
        });
        if (silent && meetsLevel(silent, n)) return silent;
      } catch (err) {
        log('silent:failed', {
          code: err instanceof DelegateIdentityError ? err.code : undefined,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return requestIdentity({
      minLevel: n,
      maxLevel: opts.maxLevel,
      fields: opts.fields,
      optionalFields: opts.optionalFields,
      mode,
      returnTo: opts.returnTo,
      responseMode: opts.responseMode,
      prompt: opts.prompt,
      loginLevel: opts.loginLevel,
      expiresIn: opts.expiresIn,
    });
  };

  const changeDelegateInfo = (
    opts: ChangeDelegateInfoOptions = {},
  ): Promise<Identity | void> => {
    const grant = getIdentity()?.grant;
    const required = grant?.required?.length ? grant.required : undefined;
    const optional = grant?.requested?.filter((name) => !grant.required?.includes(name));
    return requestIdentity({
      minLevel: opts.minLevel ?? 1,
      maxLevel: opts.maxLevel,
      fields: opts.fields ?? required,
      optionalFields: opts.optionalFields ?? (optional?.length ? optional : undefined),
      mode: opts.mode ?? 'popup',
      returnTo: opts.returnTo,
      responseMode: opts.responseMode,
      prompt: 'select',
      loginLevel: opts.loginLevel,
      expiresIn: opts.expiresIn,
    });
  };

  const logout = async (opts: LogoutOptions = {}): Promise<void> => {
    storage.clearIdentity();
    notify(null);
    if (!opts.delegate) return;
    if (opts.mode === 'popup' && provider.buildLogoutBridgeUrl) {
      const delegateBase = trimSlash(config.delegateUrl ?? DEFAULT_DELEGATE_URL);
      const result = await openLogoutPopup({
        url: provider.buildLogoutBridgeUrl({ domain }),
        expectedOrigin:
          provider.messageOrigin?.(defaultConfiguration(delegateBase)) ??
          new URL(delegateBase).origin,
        log,
      });
      if (result) return;
      log('logout_popup:fallback_to_redirect', {});
    }
    const built = provider.buildLogoutUrl?.({
      domain,
      returnTo: currentHref(),
    });
    if (built !== undefined) assignLocation(await built);
  };

  const core = config.core
    ? createCoreClient({
        ...config.core,
        fetchImpl,
        getDelegateToken: () => storage.get(STORAGE_KEYS.token),
        getSessionToken: () => storage.get(STORAGE_KEYS.coreSession),
        setSessionToken: (token) => {
          if (token) storage.set(STORAGE_KEYS.coreSession, token);
          else storage.remove(STORAGE_KEYS.coreSession);
        },
      })
    : undefined;

  return {
    async getDomainUnid(): Promise<string> {
      const identity = getIdentity();
      if (identity?.sub) return identity.sub;
      const stored = storage.get(STORAGE_KEYS.domainUnid);
      if (stored) return stored;
      throw new DelegateIdentityError(
        'login_required',
        'No Domain UNID available. Call requestIdentity() first.',
      );
    },
    getIdentity,
    getToken: () => (getIdentity() ? storage.get(STORAGE_KEYS.token) : null),
    requestIdentity,
    handleCallback,
    ensureLevel,
    changeDelegateInfo,
    logout,
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    gate(opts: GateOptions) {
      const evaluate = (identity: Identity | null): void => {
        const allowed = meetsGate(opts, identity);
        if (allowed) opts.onAllow?.(identity);
        else opts.onBlock?.(identity);
        opts.onChange?.(allowed, identity);
      };
      evaluate(getIdentity());
      listeners.add(evaluate);
      return () => {
        listeners.delete(evaluate);
      };
    },
    get level() {
      return getIdentity()?.level ?? 0;
    },
    get isAnonymous() {
      const identity = getIdentity();
      return !identity || identity.level === 0;
    },
    core,
  };
}
