import { createCoreClient } from './core';
import { fetchDiscovery, fetchJwks } from './discovery';
import { DelegateIdentityError } from './errors';
import { meetsLevel } from './levels';
import { openIdentityPopup } from './popup';
import { randomId } from './random';
import { createStorage, STORAGE_KEYS } from './storage';
import type {
  Engine9Id,
  Engine9IdConfig,
  EnsureLevelOptions,
  FetchImpl,
  Identity,
  RequestIdentityOptions,
} from './types';
import { DEFAULT_DELEGATE_URL } from './types';
import {
  authorizeUrl,
  bridgeUrl,
  logoutUrl,
  parseDelegateCallback,
  stripCallbackParams,
  trimSlash,
} from './url';
import { CLOCK_SKEW_SECONDS, verifyIdentityToken } from './verify';

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== 'function') {
    throw new DelegateIdentityError('invalid_request', 'fetch is required');
  }
  return fetch(input, init);
}

function currentOrigin(): string {
  return typeof location !== 'undefined' ? location.origin : '';
}

function currentHref(): string {
  return typeof location !== 'undefined' ? location.href : '';
}

function delegateOrigin(delegateUrl: string): string {
  return new URL(delegateUrl).origin;
}

function isUnexpired(identity: Identity, now = Date.now() / 1000): boolean {
  return typeof identity.exp === 'number' && now <= identity.exp + CLOCK_SKEW_SECONDS;
}

function readStoredIdentity(raw: string | null): Identity | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Identity;
    if (!parsed || typeof parsed.unid !== 'string') return null;
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

export function createEngine9Id(config: Engine9IdConfig = {}): Engine9Id {
  const delegateUrl = trimSlash(config.delegateUrl ?? DEFAULT_DELEGATE_URL);
  const site = config.site ?? currentOrigin();
  const storage = createStorage(config.storage ?? 'session');
  const fetchImpl: FetchImpl = config.fetchImpl ?? defaultFetch;
  const listeners = new Set<(identity: Identity | null) => void>();

  const notify = (identity: Identity | null): void => {
    for (const cb of listeners) cb(identity);
  };

  const persist = (identity: Identity, token: string): void => {
    storage.set(STORAGE_KEYS.token, token);
    storage.set(STORAGE_KEYS.identity, JSON.stringify(identity));
    storage.set(STORAGE_KEYS.unid, identity.unid);
    notify(identity);
  };

  const getIdentity = (): Identity | null =>
    readStoredIdentity(storage.get(STORAGE_KEYS.identity));

  const verifyAndStore = async (token: string, nonce?: string): Promise<Identity> => {
    const discovery = await fetchDiscovery(delegateUrl, fetchImpl);
    const jwks = await fetchJwks(discovery.jwks_uri, fetchImpl);
    const identity = await verifyIdentityToken({
      token,
      jwks,
      site,
      issuer: discovery.issuer,
      nonce,
    });
    persist(identity, token);
    return identity;
  };

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
    if (!site) {
      throw new DelegateIdentityError('invalid_site', 'createEngine9Id requires site');
    }
    const { nonce, state } = beginRequest();
    const discovery = await fetchDiscovery(delegateUrl, fetchImpl);
    const returnTo = opts.returnTo ?? currentHref();
    const shared = {
      site,
      minLevel: opts.minLevel,
      maxLevel: opts.maxLevel,
      fields: opts.fields,
      prompt: opts.prompt,
      nonce,
      state,
    };

    if (opts.mode === 'redirect') {
      assignLocation(
        authorizeUrl({
          ...shared,
          delegateUrl,
          returnTo,
          responseMode: opts.responseMode,
          authorizeEndpoint: discovery.identity_authorize_endpoint,
        }),
      );
      return;
    }

    const popupUrl = bridgeUrl({
      ...shared,
      delegateUrl,
      bridgeEndpoint: discovery.identity_bridge_endpoint,
    });
    const message = await openIdentityPopup({
      url: popupUrl,
      expectedOrigin: delegateOrigin(discovery.issuer || delegateUrl),
    });
    if (!message) {
      assignLocation(
        authorizeUrl({
          ...shared,
          delegateUrl,
          returnTo,
          responseMode: opts.responseMode,
          authorizeEndpoint: discovery.identity_authorize_endpoint,
        }),
      );
      return;
    }
    if (message.state && message.state !== state) {
      throw new DelegateIdentityError('invalid_request', 'state mismatch');
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

    const clean = (): void => {
      if (typeof location === 'undefined' || typeof history === 'undefined') return;
      history.replaceState(history.state, '', stripCallbackParams(location.href));
    };

    try {
      if (parsed.error) {
        throw new DelegateIdentityError(
          parsed.error,
          `Delegate returned ${parsed.error}`,
        );
      }
      if (!parsed.token) return null;
      const expectedState = storage.get(STORAGE_KEYS.state);
      if (expectedState && parsed.state !== expectedState) {
        throw new DelegateIdentityError('invalid_request', 'state mismatch');
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
          mode,
          returnTo: opts.returnTo,
          responseMode: opts.responseMode,
          prompt: 'none',
        });
        if (silent && meetsLevel(silent, n)) return silent;
      } catch {
        // interaction required — continue
      }
    }
    return requestIdentity({
      minLevel: n,
      maxLevel: opts.maxLevel,
      fields: opts.fields,
      mode,
      returnTo: opts.returnTo,
      responseMode: opts.responseMode,
      prompt: opts.prompt,
    });
  };

  const logout = (opts: { delegate?: boolean } = {}): void => {
    storage.clearIdentity();
    notify(null);
    if (opts.delegate) {
      assignLocation(
        logoutUrl({
          delegateUrl,
          site,
          returnTo: currentHref(),
        }),
      );
    }
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
    async getUnid(): Promise<string> {
      const identity = getIdentity();
      if (identity?.unid) return identity.unid;
      const stored = storage.get(STORAGE_KEYS.unid);
      if (stored) return stored;
      throw new DelegateIdentityError(
        'login_required',
        'No UNID available. Call requestIdentity() first.',
      );
    },
    getIdentity,
    requestIdentity,
    handleCallback,
    ensureLevel,
    logout,
    onChange(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    get level() {
      return getIdentity()?.level ?? 0;
    },
    get isAnonymous() {
      const identity = getIdentity();
      return !identity || identity.level === 0 || !identity.profile;
    },
    core,
  };
}
