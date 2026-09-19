import { DelegateIdentityError } from './errors';
import type {
  CoreClient,
  CoreConfig,
  CoreLoginResult,
  CoreSession,
  FetchImpl,
} from './types';
import { trimSlash } from './url';

export interface CreateCoreClientOptions extends CoreConfig {
  getDelegateToken: () => string | null;
  getSessionToken?: () => string | null;
  setSessionToken?: (token: string | null) => void;
  fetchImpl?: FetchImpl;
}

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== 'function') {
    throw new DelegateIdentityError('crypto_unavailable', 'fetch is required for core');
  }
  return fetch(input, init);
}

function asJson(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return res.json();
  return res.text();
}

function loginResult(body: unknown, fallbackToken?: string): CoreLoginResult {
  if (!body || typeof body !== 'object') {
    if (fallbackToken) return { token: fallbackToken, session: {} };
    throw new DelegateIdentityError('invalid_request', 'core login returned an empty body');
  }
  const rec = body as Record<string, unknown>;
  const token =
    (typeof rec.token === 'string' && rec.token) ||
    (typeof rec.session_token === 'string' && rec.session_token) ||
    fallbackToken;
  if (!token) {
    throw new DelegateIdentityError('invalid_request', 'core login did not return a session token');
  }
  const session =
    rec.session && typeof rec.session === 'object'
      ? (rec.session as CoreSession)
      : (rec as CoreSession);
  return { token, session };
}

function applyCoreHeaders(
  headers: Headers,
  publicApiKey: string,
  sessionToken: string | null,
): void {
  headers.set('Authorization', `Bearer ${publicApiKey}`);
  headers.set('X-API-Key', publicApiKey);
  if (sessionToken) headers.set('X-Engine9-Session', sessionToken);
}

/**
 * Browser helper for a Site that embeds `@engine9/core`.
 * Sends the public API key on every call (`Authorization` and `X-API-Key`).
 */
export function createCoreClient(opts: CreateCoreClientOptions): CoreClient {
  const apiUrl = trimSlash(opts.apiUrl);
  const fetchImpl = opts.fetchImpl ?? defaultFetch;

  const sessionToken = (): string | null => opts.getSessionToken?.() ?? null;

  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const url = path.startsWith('http')
      ? path
      : `${apiUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(init.headers);
    applyCoreHeaders(headers, opts.publicApiKey, sessionToken());
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetchImpl(url, { ...init, headers });
  };

  return {
    async login(): Promise<CoreLoginResult> {
      const delegateToken = opts.getDelegateToken();
      if (!delegateToken) {
        throw new DelegateIdentityError(
          'login_required',
          'No Identity Token. Call requestIdentity() first.',
        );
      }
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ delegate_token: delegateToken }),
      });
      const body = await asJson(res);
      if (!res.ok) {
        const message =
          body && typeof body === 'object' && 'error' in body
            ? String((body as { error: unknown }).error)
            : `core login failed (${res.status})`;
        throw new DelegateIdentityError('invalid_request', message);
      }
      const result = loginResult(body);
      opts.setSessionToken?.(result.token);
      return result;
    },

    async me(): Promise<CoreSession> {
      const res = await request('/auth/me', { method: 'GET' });
      const body = await asJson(res);
      if (!res.ok) {
        throw new DelegateIdentityError('login_required', 'core /auth/me failed');
      }
      return (body && typeof body === 'object' ? body : {}) as CoreSession;
    },

    async changeRole(roleId: string): Promise<CoreLoginResult> {
      const res = await request('/auth/role', {
        method: 'POST',
        body: JSON.stringify({ role_id: roleId }),
      });
      const body = await asJson(res);
      if (!res.ok) {
        throw new DelegateIdentityError('access_denied', 'core changeRole failed');
      }
      const result = loginResult(body, sessionToken() ?? undefined);
      if (result.token) opts.setSessionToken?.(result.token);
      return result;
    },

    fetch(path: string, init?: RequestInit): Promise<Response> {
      return request(path, init);
    },
  };
}
