import { DelegateIdentityError, delegateReturnedError } from './errors';
import { LOG_PREFIX, type DebugLog } from './log';

export const DELEGATE_IDENTITY_MESSAGE = 'delegate-identity';
export const DELEGATE_LOGOUT_MESSAGE = 'delegate-logout';

export interface DelegateIdentityMessage {
  token: string;
  state?: string;
}

export interface ListenForIdentityOptions {
  expectedOrigin: string;
  popup?: Window | null;
  signal?: AbortSignal;
  log?: DebugLog;
}

function isIdentityMessage(
  data: unknown,
): data is { type: string; token?: string; state?: string; error?: string } {
  return Boolean(data && typeof data === 'object' && 'type' in data);
}

/**
 * Resolve when `window` receives `{ type: "delegate-identity", token }`
 * from `expectedOrigin` (the delegate origin). Other origins are ignored.
 * Reject with the delegate error code when the message carries
 * `{ type: "delegate-identity", error }` instead of a token.
 */
export function listenForDelegateIdentity(
  opts: ListenForIdentityOptions,
): Promise<DelegateIdentityMessage> {
  const { expectedOrigin, popup, signal } = opts;
  const log = opts.log ?? (() => {});
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DelegateIdentityError('access_denied', 'Identity popup aborted'));
      return;
    }

    const cleanup = (): void => {
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(new DelegateIdentityError('access_denied', 'Identity popup aborted'));
    };

    const onMessage = (event: MessageEvent): void => {
      if (!isIdentityMessage(event.data)) return;
      if (event.data.type !== DELEGATE_IDENTITY_MESSAGE) return;
      if (event.origin !== expectedOrigin) {
        console.warn(
          LOG_PREFIX,
          `Ignored a ${DELEGATE_IDENTITY_MESSAGE} message from ${event.origin}; expected ${expectedOrigin}. Check delegateUrl.`,
        );
        return;
      }
      if (popup && event.source && event.source !== popup) {
        log('popup:message_from_other_window_ignored', { origin: event.origin });
        return;
      }
      if (typeof event.data.token !== 'string' || !event.data.token) {
        if (typeof event.data.error === 'string' && event.data.error) {
          log('popup:error_received', { error: event.data.error });
          cleanup();
          reject(delegateReturnedError(event.data.error, { step: 'popup', state: event.data.state }));
        }
        return;
      }
      log('popup:token_received', { tokenLength: event.data.token.length });
      cleanup();
      resolve({
        token: event.data.token,
        state: typeof event.data.state === 'string' ? event.data.state : undefined,
      });
    };

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort);
  });
}

export interface OpenIdentityPopupOptions {
  url: string;
  expectedOrigin: string;
  name?: string;
  features?: string;
  log?: DebugLog;
}

/**
 * Open `/identity/bridge` as a top-level popup and wait for postMessage.
 * Returns null when the popup is blocked so the caller can fall back to redirect.
 */
export function openIdentityPopup(
  opts: OpenIdentityPopupOptions,
): Promise<DelegateIdentityMessage | null> {
  const log = opts.log ?? (() => {});
  const popup = window.open(
    opts.url,
    opts.name ?? 'engine9-identity',
    opts.features ?? 'popup=yes,width=480,height=720',
  );
  if (!popup) {
    log('popup:blocked', { url: opts.url });
    return Promise.resolve(null);
  }
  const openedAt = Date.now();
  log('popup:opened', { url: opts.url, expectedOrigin: opts.expectedOrigin });

  const controller = new AbortController();
  const closed = new Promise<never>((_, reject) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        controller.abort();
        const openForMs = Date.now() - openedAt;
        log('popup:closed_without_message', { openForMs });
        reject(
          new DelegateIdentityError(
            'access_denied',
            `Identity popup closed after ${Math.round(openForMs / 1000)}s without sending an Identity Token. ` +
              'Either it was closed by hand, or it lost its link to this page: a page shown in it sent ' +
              'Cross-Origin-Opener-Policy (a Cloudflare bot check on Delegate does this), and the browser ' +
              "then reports the window as closed. If this repeats, use mode: 'redirect'.",
            { step: 'popup', reason: 'popup_closed', openForMs, url: opts.url },
          ),
        );
      }
    }, 300);
    controller.signal.addEventListener('abort', () => window.clearInterval(timer));
  });

  return Promise.race([
    listenForDelegateIdentity({
      expectedOrigin: opts.expectedOrigin,
      popup,
      signal: controller.signal,
      log,
    }).finally(() => {
      controller.abort();
      try {
        popup.close();
      } catch {
        // ignore
      }
    }),
    closed,
  ]);
}

export interface OpenLogoutPopupOptions {
  url: string;
  expectedOrigin: string;
  log?: DebugLog;
}

/**
 * Open `/identity/logout/bridge` and wait for `{ type: "delegate-logout" }`.
 * Resolves `loggedOut`, or `closed` when the window closed without answering.
 * Returns null when the popup is blocked so the caller can fall back to redirect.
 */
export function openLogoutPopup(
  opts: OpenLogoutPopupOptions,
): Promise<'loggedOut' | 'closed' | null> {
  const log = opts.log ?? (() => {});
  const popup = window.open(opts.url, 'engine9-logout', 'popup=yes,width=420,height=320');
  if (!popup) {
    log('logout_popup:blocked', { url: opts.url });
    return Promise.resolve(null);
  }
  log('logout_popup:opened', { url: opts.url });
  return new Promise((resolve) => {
    const finish = (result: 'loggedOut' | 'closed'): void => {
      window.clearInterval(timer);
      window.removeEventListener('message', onMessage);
      log(`logout_popup:${result}`, {});
      resolve(result);
    };
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data !== 'object' || data.type !== DELEGATE_LOGOUT_MESSAGE) return;
      if (event.origin !== opts.expectedOrigin) return;
      if (event.source && event.source !== popup) return;
      finish('loggedOut');
    };
    const timer = window.setInterval(() => {
      if (popup.closed) finish('closed');
    }, 300);
    window.addEventListener('message', onMessage);
  });
}
