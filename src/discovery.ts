import { DEFAULT_DELEGATE_URL } from './types';
import type { DelegateConfiguration, FetchImpl, Jwk } from './types';
import { trimSlash } from './url';

const discoveryCache = new Map<string, DelegateConfiguration>();
const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();

const JWKS_TTL_MS = 60 * 60 * 1000;

export function defaultConfiguration(delegateUrl: string): DelegateConfiguration {
  const base = trimSlash(delegateUrl || DEFAULT_DELEGATE_URL);
  return {
    issuer: base,
    jwks_uri: `${base}/.well-known/jwks.json`,
    identity_authorize_endpoint: `${base}/identity/authorize`,
    identity_bridge_endpoint: `${base}/identity/bridge`,
    logout_endpoint: `${base}/identity/logout`,
    profile_endpoint: `${base}/profiles`,
    levels_supported: [0, 1, 2, 3, 4],
    token_signing_alg_values_supported: ['ES256'],
    legacy_handoff_endpoints: {
      authorize: `${base}/handoff/authorize`,
      exchange: `${base}/handoff/exchange`,
      browser_exchange: `${base}/handoff/browser-exchange`,
    },
  };
}

function normalizeDiscovery(
  delegateUrl: string,
  raw: Partial<DelegateConfiguration> | null | undefined,
): DelegateConfiguration {
  const fallback = defaultConfiguration(delegateUrl);
  if (!raw || typeof raw !== 'object') return fallback;
  return {
    ...fallback,
    ...raw,
    issuer: raw.issuer || fallback.issuer,
    jwks_uri: raw.jwks_uri || fallback.jwks_uri,
    identity_authorize_endpoint:
      raw.identity_authorize_endpoint || fallback.identity_authorize_endpoint,
    identity_bridge_endpoint:
      raw.identity_bridge_endpoint || fallback.identity_bridge_endpoint,
    logout_endpoint: raw.logout_endpoint || fallback.logout_endpoint,
  };
}

export async function fetchDiscovery(
  delegateUrl: string,
  fetchImpl: FetchImpl,
): Promise<DelegateConfiguration> {
  const key = trimSlash(delegateUrl);
  const cached = discoveryCache.get(key);
  if (cached) return cached;
  try {
    const res = await fetchImpl(`${key}/.well-known/delegate-configuration`);
    if (res.ok) {
      const json = (await res.json()) as Partial<DelegateConfiguration>;
      const cfg = normalizeDiscovery(key, json);
      discoveryCache.set(key, cfg);
      return cfg;
    }
  } catch {
    // fall through to constructed defaults
  }
  return defaultConfiguration(key);
}

export async function fetchJwks(
  jwksUri: string,
  fetchImpl: FetchImpl,
): Promise<{ keys: Jwk[] }> {
  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) {
    return { keys: cached.keys };
  }
  const res = await fetchImpl(jwksUri);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS (${res.status}) from ${jwksUri}`);
  }
  const json = (await res.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(json.keys) ? json.keys : [];
  jwksCache.set(jwksUri, { keys, fetchedAt: Date.now() });
  return { keys };
}

export function clearDiscoveryCache(): void {
  discoveryCache.clear();
  jwksCache.clear();
}
