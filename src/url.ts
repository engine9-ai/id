export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Canonical login consumer id: lowercased host, or `host:port` when `URL.port`
 * is non-empty (default https/http ports omitted).
 */
export function domainFromUrl(urlOrOrigin: string): string | null {
  try {
    const u = new URL(urlOrOrigin);
    const hostname = u.hostname.toLowerCase();
    if (!hostname) return null;
    return u.port ? `${hostname}:${u.port}` : hostname;
  } catch {
    return null;
  }
}

export interface AuthorizeUrlOptions {
  delegateUrl: string;
  domain: string;
  returnTo: string;
  minLevel?: number;
  maxLevel?: number;
  fields?: string[] | string;
  prompt?: string;
  nonce?: string;
  state?: string;
  responseMode?: 'fragment' | 'query';
  authorizeEndpoint?: string;
}

export interface BridgeUrlOptions {
  delegateUrl: string;
  domain: string;
  minLevel?: number;
  maxLevel?: number;
  fields?: string[] | string;
  prompt?: string;
  nonce?: string;
  state?: string;
  bridgeEndpoint?: string;
}

export interface LogoutUrlOptions {
  delegateUrl: string;
  domain: string;
  returnTo?: string;
  logoutEndpoint?: string;
}

function setOptional(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
): void {
  if (value === undefined || value === '') return;
  params.set(key, String(value));
}

function fieldsParam(fields?: string[] | string): string | undefined {
  if (!fields) return undefined;
  return Array.isArray(fields) ? fields.join(',') : fields;
}

/** Build GET /identity/authorize. Query param is `domain` (not audience). */
export function authorizeUrl(opts: AuthorizeUrlOptions): string {
  const base =
    opts.authorizeEndpoint ?? `${trimSlash(opts.delegateUrl)}/identity/authorize`;
  const url = new URL(base);
  url.searchParams.set('domain', opts.domain);
  url.searchParams.set('return_to', opts.returnTo);
  setOptional(url.searchParams, 'min_level', opts.minLevel);
  setOptional(url.searchParams, 'max_level', opts.maxLevel);
  setOptional(url.searchParams, 'fields', fieldsParam(opts.fields));
  setOptional(url.searchParams, 'prompt', opts.prompt);
  setOptional(url.searchParams, 'nonce', opts.nonce);
  setOptional(url.searchParams, 'state', opts.state);
  setOptional(url.searchParams, 'response_mode', opts.responseMode);
  return url.toString();
}

/** Build GET /identity/bridge for the popup chooser. */
export function bridgeUrl(opts: BridgeUrlOptions): string {
  const base =
    opts.bridgeEndpoint ?? `${trimSlash(opts.delegateUrl)}/identity/bridge`;
  const url = new URL(base);
  url.searchParams.set('domain', opts.domain);
  setOptional(url.searchParams, 'min_level', opts.minLevel);
  setOptional(url.searchParams, 'max_level', opts.maxLevel);
  setOptional(url.searchParams, 'fields', fieldsParam(opts.fields));
  setOptional(url.searchParams, 'prompt', opts.prompt);
  setOptional(url.searchParams, 'nonce', opts.nonce);
  setOptional(url.searchParams, 'state', opts.state);
  return url.toString();
}

/** Build GET /identity/logout. */
export function logoutUrl(opts: LogoutUrlOptions): string {
  const base =
    opts.logoutEndpoint ?? `${trimSlash(opts.delegateUrl)}/identity/logout`;
  const url = new URL(base);
  url.searchParams.set('domain', opts.domain);
  setOptional(url.searchParams, 'return_to', opts.returnTo);
  return url.toString();
}

export interface DelegateCallback {
  token?: string;
  state?: string;
  error?: string;
}

function paramsFrom(part: string, strip: '#' | '?'): URLSearchParams {
  const raw = part.startsWith(strip) ? part.slice(1) : part;
  return new URLSearchParams(raw);
}

/**
 * Read `delegate_token` / `state` / `error` from a hash (default) or query.
 * Hash wins when both are present.
 */
export function parseDelegateCallback(
  source?: { hash?: string; search?: string; href?: string } | string,
): DelegateCallback | null {
  let hash = '';
  let search = '';
  if (typeof source === 'string') {
    try {
      const url = new URL(source);
      hash = url.hash;
      search = url.search;
    } catch {
      return null;
    }
  } else if (source) {
    if (source.href && !source.hash && !source.search) {
      try {
        const url = new URL(source.href);
        hash = url.hash;
        search = url.search;
      } catch {
        hash = source.hash ?? '';
        search = source.search ?? '';
      }
    } else {
      hash = source.hash ?? '';
      search = source.search ?? '';
    }
  } else if (typeof location !== 'undefined') {
    hash = location.hash ?? '';
    search = location.search ?? '';
  }

  const fromHash = paramsFrom(hash, '#');
  const fromSearch = paramsFrom(search, '?');
  const token =
    fromHash.get('delegate_token') || fromSearch.get('delegate_token') || undefined;
  const error = fromSearch.get('error') || fromHash.get('error') || undefined;
  const state = fromHash.get('state') || fromSearch.get('state') || undefined;
  if (!token && !error) return null;
  return { token, error, state };
}

export function stripCallbackParams(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('delegate_token');
  url.searchParams.delete('state');
  url.searchParams.delete('error');
  if (url.hash) {
    const hashParams = paramsFrom(url.hash, '#');
    if (
      hashParams.has('delegate_token') ||
      hashParams.has('state') ||
      hashParams.has('error')
    ) {
      hashParams.delete('delegate_token');
      hashParams.delete('state');
      hashParams.delete('error');
      const leftover = hashParams.toString();
      url.hash = leftover ? leftover : '';
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
