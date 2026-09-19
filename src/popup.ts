import { DelegateIdentityError } from './errors';

export const DELEGATE_IDENTITY_MESSAGE = 'delegate-identity';

export interface DelegateIdentityMessage {
  token: string;
  state?: string;
}

export interface ListenForIdentityOptions {
  expectedOrigin: string;
  popup?: Window | null;
  signal?: AbortSignal;
}

function isIdentityMessage(data: unknown): data is { type: string; token?: string; state?: string } {
  return Boolean(data && typeof data === 'object' && 'type' in data);
}

/**
 * Resolve when `window` receives `{ type: "delegate-identity", token }`
 * from `expectedOrigin` (the delegate origin). Other origins are ignored.
 */
export function listenForDelegateIdentity(
  opts: ListenForIdentityOptions,
): Promise<DelegateIdentityMessage> {
  const { expectedOrigin, popup, signal } = opts;
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
      if (event.origin !== expectedOrigin) return;
      if (popup && event.source && event.source !== popup) return;
      if (!isIdentityMessage(event.data)) return;
      if (event.data.type !== DELEGATE_IDENTITY_MESSAGE) return;
      if (typeof event.data.token !== 'string' || !event.data.token) return;
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
}

/**
 * Open `/identity/bridge` as a top-level popup and wait for postMessage.
 * Returns null when the popup is blocked so the caller can fall back to redirect.
 */
export function openIdentityPopup(
  opts: OpenIdentityPopupOptions,
): Promise<DelegateIdentityMessage | null> {
  const popup = window.open(
    opts.url,
    opts.name ?? 'engine9-identity',
    opts.features ?? 'popup=yes,width=480,height=720',
  );
  if (!popup) return Promise.resolve(null);

  const controller = new AbortController();
  const closed = new Promise<never>((_, reject) => {
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        controller.abort();
        reject(new DelegateIdentityError('access_denied', 'Identity popup closed'));
      }
    }, 300);
    controller.signal.addEventListener('abort', () => window.clearInterval(timer));
  });

  return Promise.race([
    listenForDelegateIdentity({
      expectedOrigin: opts.expectedOrigin,
      popup,
      signal: controller.signal,
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
