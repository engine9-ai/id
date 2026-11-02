import { DelegateIdentityError, SITE_KEY_REJECTED } from './errors';
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
  /** `session: 'cookie'`: the `state` of the request behind the current Identity Token. */
  getLoginState?: () => string | null;
  /** Forget that `state`: core accepts each one once. */
  clearLoginState?: () => void;
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

/* `kind` is core 1.17.0 and later; earlier core sends only this error text. */
const KEY_ERROR_TEXT = /^unauthorized: (missing_key|unknown_key|inactive_key|expired_key)$/;

/**
 * The error for a failed core call. A refused public key is `site_key_rejected`
 * on every route, so a Site can tell its own setup apart from the visitor.
 */
function coreError(
  res: Response,
  body: unknown,
  code: string,
  fallbackMessage: string,
): DelegateIdentityError {
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = typeof rec.error === 'string' ? rec.error : '';
  const legacy = res.status === 401 ? KEY_ERROR_TEXT.exec(text) : null;
  const reason = typeof rec.reason === 'string' ? rec.reason : legacy?.[1];
  const hint = typeof rec.hint === 'string' ? rec.hint : undefined;
  const details: Record<string, unknown> = { status: res.status };
  if (reason) details.reason = reason;
  if (hint) details.hint = hint;
  if (rec.kind === 'api_key' || legacy) {
    return new DelegateIdentityError(
      SITE_KEY_REJECTED,
      `@engine9/core refused this site's public API key (${reason ?? 'unauthorized'}). This is a site setup problem, not a sign-in problem.${hint ? ` ${hint}` : ''}`,
      details,
    );
  }
  return new DelegateIdentityError(code, text || fallbackMessage, details);
}

function loginResult(body: unknown, fallbackToken?: string, cookie = false): CoreLoginResult {
  if (!body || typeof body !== 'object') {
    if (cookie) return { session: {} };
    if (fallbackToken) return { token: fallbackToken, session: {} };
    throw new DelegateIdentityError('invalid_request', 'core login returned an empty body');
  }
  const rec = body as Record<string, unknown>;
  const session =
    rec.session && typeof rec.session === 'object'
      ? (rec.session as CoreSession)
      : (rec as CoreSession);
  // The cookie is the session; core leaves the token out of the body.
  if (cookie) return { session };
  const token =
    (typeof rec.token === 'string' && rec.token) ||
    (typeof rec.session_token === 'string' && rec.session_token) ||
    fallbackToken;
  if (!token) {
    throw new DelegateIdentityError('invalid_request', 'core login did not return a session token');
  }
  return { token, session };
}

/** True when `apiUrl` is on this page's host, so the browser sends core's cookie to it. */
function sameHost(apiUrl: string): boolean {
  if (typeof location === 'undefined') return true;
  try {
    return new URL(apiUrl, location.href).host === location.host;
  } catch {
    return false;
  }
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
  const cookie = opts.session === 'cookie';
  if (cookie && !sameHost(apiUrl) && typeof console !== 'undefined') {
    console.error(
      '[engine9/id]',
      `core.session is 'cookie', but core.apiUrl (${apiUrl}) is not on this page's host, so the browser will not send core's session cookie to it. Serve core on this host (for example /api), or use session: 'token'.`,
    );
  }

  // With a cookie session the browser sends the cookie; no session header.
  const sessionToken = (): string | null => (cookie ? null : opts.getSessionToken?.() ?? null);

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

  // A refused key fails every call the same way: say so once, even when the Site catches it.
  let keyReported = false;
  const fail = (res: Response, body: unknown, code: string, message: string): DelegateIdentityError => {
    const error = coreError(res, body, code, message);
    if (error.code === SITE_KEY_REJECTED && !keyReported && typeof console !== 'undefined') {
      keyReported = true;
      console.error('[engine9/id]', error.message);
    }
    return error;
  };

  return {
    async begin(): Promise<{ state: string; nonce: string }> {
      const res = await request('/auth/begin', { method: 'POST', body: '{}' });
      const body = await asJson(res);
      if (!res.ok) {
        throw fail(res, body, 'invalid_request', `core could not start a sign-in (${res.status})`);
      }
      const rec = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      if (typeof rec.state !== 'string' || typeof rec.nonce !== 'string') {
        throw new DelegateIdentityError(
          'invalid_request',
          'core POST /auth/begin did not return a state and nonce. @engine9/core 1.18.0 or later is needed for session: \'cookie\'.',
          { status: res.status },
        );
      }
      return { state: rec.state, nonce: rec.nonce };
    },

    async login(): Promise<CoreLoginResult> {
      const delegateToken = opts.getDelegateToken();
      if (!delegateToken) {
        throw new DelegateIdentityError(
          'login_required',
          'No Identity Token. Call requestIdentity() first.',
        );
      }
      const payload: Record<string, unknown> = { delegate_token: delegateToken };
      if (cookie) {
        payload.cookie = true;
        payload.state = opts.getLoginState?.() ?? undefined;
        // Core accepts each sign-in once, whatever it answers.
        opts.clearLoginState?.();
      }
      const res = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const body = await asJson(res);
      if (!res.ok) {
        throw fail(res, body, 'invalid_request', `core login failed (${res.status})`);
      }
      const result = loginResult(body, undefined, cookie);
      opts.setSessionToken?.(result.token ?? null);
      return result;
    },

    async logout(): Promise<void> {
      const res = await request('/auth/logout', { method: 'POST', body: '{}' });
      opts.setSessionToken?.(null);
      if (!res.ok) {
        throw fail(res, await asJson(res), 'invalid_request', `core logout failed (${res.status})`);
      }
    },

    async me(): Promise<CoreSession> {
      const res = await request('/auth/me', { method: 'GET' });
      const body = await asJson(res);
      if (!res.ok) {
        throw fail(res, body, 'login_required', 'core /auth/me failed');
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
        throw fail(res, body, 'access_denied', 'core changeRole failed');
      }
      const result = loginResult(body, sessionToken() ?? undefined, cookie);
      if (result.token) opts.setSessionToken?.(result.token);
      return result;
    },

    fetch(path: string, init?: RequestInit): Promise<Response> {
      return request(path, init);
    },
  };
}
