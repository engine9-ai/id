import { defaultConfiguration, fetchDiscovery, fetchJwks } from './discovery';
import type {
  DelegateConfiguration,
  FetchImpl,
  Identity,
  Prompt,
  ResponseMode,
} from './types';
import { DEFAULT_DELEGATE_URL } from './types';
import {
  authorizeUrl,
  bridgeUrl,
  logoutUrl,
  trimSlash,
} from './url';
import { verifyIdentityToken } from './verify';

/** Discovery / endpoint config returned by an IdentityProvider. */
export type ProviderConfig = DelegateConfiguration;

export interface BuildAuthorizeOptions {
  site: string;
  returnTo: string;
  minLevel?: number;
  maxLevel?: number;
  fields?: string[];
  prompt?: Prompt;
  nonce?: string;
  state?: string;
  responseMode?: ResponseMode;
}

export interface BuildBridgeOptions {
  site: string;
  minLevel?: number;
  maxLevel?: number;
  fields?: string[];
  prompt?: Prompt;
  nonce?: string;
  state?: string;
}

export interface BuildLogoutOptions {
  site: string;
  returnTo?: string;
}

export interface VerifyTokenOptions {
  site: string;
  nonce?: string;
}

/**
 * Pluggable identity provider. Delegate is the default; custom providers must
 * produce the normalized Identity shape (levels, profile field names).
 * This is not OIDC — do not invent OpenID Connect discovery or id_token aliases.
 */
export interface IdentityProvider {
  readonly id: string;
  discover(): Promise<ProviderConfig>;
  buildAuthorizeUrl(opts: BuildAuthorizeOptions): Promise<string> | string;
  buildBridgeUrl?(opts: BuildBridgeOptions): Promise<string> | string;
  buildLogoutUrl?(opts: BuildLogoutOptions): Promise<string> | string;
  /** Origin trusted for popup postMessage (usually issuer origin). */
  messageOrigin?(config: ProviderConfig): string;
  verifyToken(token: string, opts: VerifyTokenOptions): Promise<Identity>;
}

export interface DelegateProviderOptions {
  /** Delegate origin. Default https://delegate.engine9.ai */
  delegateUrl?: string;
  fetchImpl?: FetchImpl;
}

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is required');
  }
  return fetch(input, init);
}

/** Default engine9 identity provider (delegate). */
export function createDelegateProvider(
  options: DelegateProviderOptions = {},
): IdentityProvider {
  const delegateUrl = trimSlash(options.delegateUrl ?? DEFAULT_DELEGATE_URL);
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  return {
    id: 'delegate',

    async discover(): Promise<ProviderConfig> {
      return fetchDiscovery(delegateUrl, fetchImpl);
    },

    async buildAuthorizeUrl(opts: BuildAuthorizeOptions): Promise<string> {
      const discovery = await fetchDiscovery(delegateUrl, fetchImpl);
      return authorizeUrl({
        delegateUrl,
        site: opts.site,
        returnTo: opts.returnTo,
        minLevel: opts.minLevel,
        maxLevel: opts.maxLevel,
        fields: opts.fields,
        prompt: opts.prompt,
        nonce: opts.nonce,
        state: opts.state,
        responseMode: opts.responseMode,
        authorizeEndpoint: discovery.identity_authorize_endpoint,
      });
    },

    async buildBridgeUrl(opts: BuildBridgeOptions): Promise<string> {
      const discovery = await fetchDiscovery(delegateUrl, fetchImpl);
      return bridgeUrl({
        delegateUrl,
        site: opts.site,
        minLevel: opts.minLevel,
        maxLevel: opts.maxLevel,
        fields: opts.fields,
        prompt: opts.prompt,
        nonce: opts.nonce,
        state: opts.state,
        bridgeEndpoint: discovery.identity_bridge_endpoint,
      });
    },

    buildLogoutUrl(opts: BuildLogoutOptions): string {
      const discovery = defaultConfiguration(delegateUrl);
      return logoutUrl({
        delegateUrl,
        site: opts.site,
        returnTo: opts.returnTo,
        logoutEndpoint: discovery.logout_endpoint,
      });
    },

    messageOrigin(config: ProviderConfig): string {
      return new URL(config.issuer || delegateUrl).origin;
    },

    async verifyToken(token: string, opts: VerifyTokenOptions): Promise<Identity> {
      const discovery = await fetchDiscovery(delegateUrl, fetchImpl);
      const jwks = await fetchJwks(discovery.jwks_uri, fetchImpl);
      return verifyIdentityToken({
        token,
        jwks,
        site: opts.site,
        issuer: discovery.issuer,
        nonce: opts.nonce,
      });
    },
  };
}
