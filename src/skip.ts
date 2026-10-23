import type { LoginLevel, LoginProviders, Prompt, SignInBrand } from './types';

export interface SkipRequest {
  mode: 'redirect' | 'popup';
  brand?: SignInBrand;
  loginProviders?: LoginProviders;
  loginLevel?: LoginLevel;
  minLevel?: number;
  prompt?: Prompt;
  fields?: string[];
  optionalFields?: string[];
}

function providerList(providers: LoginProviders | undefined): string[] {
  if (!providers) return ['google'];
  const list = (Array.isArray(providers) ? providers : providers.split(','))
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : ['google'];
}

/**
 * Why Delegate will still show its provider screen (the selector on
 * `/login`): one line per reason that can be seen from the request alone.
 * One provider on a full-page login opens itself. Reasons that depend on
 * the visitor (an earlier Grant, a cancelled skip in this tab) are not
 * listed; see docs/protocol.md#when-a-delegate-screen-appears.
 */
export function skipDowngrades(req: SkipRequest): string[] {
  const reasons: string[] = [];

  if (req.mode === 'popup') {
    reasons.push(
      "Delegate will show its provider screen because this is a popup. A browser blocks a window opened without a click. Use a full-page login (mode: 'redirect', or signIn()).",
    );
  }
  const providers = providerList(req.loginProviders);
  if (providers.length > 1) {
    reasons.push(
      `Delegate will show its provider screen because loginProviders is ${providers.join(',')}. The visitor has to pick.`,
    );
  }
  if (req.loginLevel === 2 && (req.minLevel ?? 0) < 3) {
    reasons.push(
      'Delegate will show its provider screen because loginLevel 2 adds an email sign-in field.',
    );
  }
  if (req.prompt === 'consent') {
    reasons.push(
      "Delegate will show its provider screen because prompt 'consent' asks to review Continue or another account.",
    );
  }

  return reasons;
}

/** Warn by default on localhost and 127.0.0.1, so production consoles stay quiet. */
export function isLocalPage(href: string): boolean {
  try {
    const host = new URL(href).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}
