export class DelegateIdentityError extends Error {
  readonly code: string;
  /** Debugging context: which step failed and what was observed. */
  readonly details?: Record<string, unknown>;

  constructor(code: string, message?: string, details?: Record<string, unknown>) {
    super(message ?? code);
    this.name = 'DelegateIdentityError';
    this.code = code;
    if (details) this.details = details;
  }
}

/**
 * Error code for a login result that answers a request this browser did not
 * start, or no longer has: another tab, an older popup or redirect, or an
 * email link opened in a different browser. Nothing has expired. Treat it
 * as "sign in again": the next login is silent when the visitor is still
 * signed in to Delegate.
 */
export const STATE_MISMATCH = 'state_mismatch';

/** True for a `state_mismatch` error (see `STATE_MISMATCH`). */
export function isStateMismatch(error: unknown): boolean {
  return error instanceof DelegateIdentityError && error.code === STATE_MISMATCH;
}

/**
 * Error code when `@engine9/core` refused the Site's public API key (a 401
 * with `kind: 'api_key'`). The Site is misconfigured: its database has no
 * active row for the key the page sends. Signing in again never fixes it.
 * `details` carries `status`, `reason` (`unknown_key`, `inactive_key`, …),
 * and core's `hint`.
 */
export const SITE_KEY_REJECTED = 'site_key_rejected';

/** True for a `site_key_rejected` error (see `SITE_KEY_REJECTED`). */
export function isSiteKeyRejected(error: unknown): boolean {
  return error instanceof DelegateIdentityError && error.code === SITE_KEY_REJECTED;
}

const DELEGATE_ERROR_TEXT: Record<string, string> = {
  interaction_required:
    'Delegate needs the User to sign in or choose what to share, and prompt=none does not allow that.',
  login_required: 'The User is not signed in to Delegate, and this request did not allow a sign-in page.',
  level_unavailable:
    'The User did not share the fields the requested Identity Level needs (min_level > 0).',
  access_denied: 'The User declined the request.',
  invalid_domain:
    'Delegate does not accept this Domain. Add it to ALLOWED_DOMAINS or register it on Delegate, and check that return_to is on the same Domain.',
  insecure_domain:
    'The page is plain http. Identity Tokens only go to https pages (or http://localhost for development).',
  invalid_request:
    'Delegate rejected the request parameters (return_to, fields, levels, or the chosen email address).',
};

/** What to tell the visitor when login is refused on the plain http page `href`. */
export function insecureDomainMessage(href: string): string {
  const { origin, host } = new URL(href);
  return `Login is not available on ${origin} because the connection is not secure. Open https://${host} instead.`;
}

/** Login refused before anything opens, because `href` is a plain http page. */
export function insecureDomainError(href: string): DelegateIdentityError {
  return new DelegateIdentityError('insecure_domain', insecureDomainMessage(href), {
    step: 'request',
    url: href,
  });
}

/** Error for an `error=` code that Delegate sent back. */
export function delegateReturnedError(
  code: string,
  details?: Record<string, unknown>,
): DelegateIdentityError {
  const why = DELEGATE_ERROR_TEXT[code];
  return new DelegateIdentityError(
    code,
    why ? `Delegate returned ${code}: ${why}` : `Delegate returned ${code}`,
    details,
  );
}
