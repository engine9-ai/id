import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createEngine9Id } from '../src/client';
import { DelegateIdentityError } from '../src/errors';
import { isInsecureUrl } from '../src/url';
import { loginWidget } from '../src/widget';

const jsdom = (globalThis as unknown as { jsdom: { reconfigure(opts: { url: string }): void } }).jsdom;
const originalUrl = location.href;

describe('isInsecureUrl', () => {
  it('flags plain http except localhost', () => {
    expect(isInsecureUrl('http://festival.example/tickets')).toBe(true);
    expect(isInsecureUrl('http://192.168.1.20:4321/')).toBe(true);
    expect(isInsecureUrl('https://festival.example/')).toBe(false);
    expect(isInsecureUrl('http://localhost:4321/')).toBe(false);
    expect(isInsecureUrl('http://127.0.0.1:4321/')).toBe(false);
    expect(isInsecureUrl('not a url')).toBe(false);
  });
});

describe('on a plain http page', () => {
  beforeAll(() => jsdom.reconfigure({ url: 'http://festival.example/tickets' }));
  afterAll(() => jsdom.reconfigure({ url: originalUrl }));
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('requestIdentity refuses without opening a popup or redirecting', async () => {
    const open = vi.spyOn(window, 'open');
    const fetchImpl = vi.fn();
    const id = createEngine9Id({ storage: 'memory', fetchImpl });
    const err = await id.requestIdentity({ minLevel: 1, mode: 'popup' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DelegateIdentityError);
    expect((err as DelegateIdentityError).code).toBe('insecure_domain');
    expect((err as Error).message).toBe(
      'Login is not available on http://festival.example because the connection is not secure. Open https://festival.example instead.',
    );
    expect(open).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('the login widget shows the refusal instead of a login button', () => {
    const widget = loginWidget({ storage: 'memory' });
    const root = widget.element.shadowRoot!;
    root.querySelector<HTMLButtonElement>('.trigger')!.click();
    const dialog = root.querySelector('dialog')!;
    expect(dialog.querySelector('[data-action="login"]')).toBeNull();
    expect(dialog.querySelector('[role="alert"]')?.textContent).toBe(
      'Login is not available on http://festival.example because the connection is not secure. Open https://festival.example instead.',
    );
    expect(dialog.querySelector('[role="alert"]')?.textContent).not.toContain('Delegate');
    widget.destroy();
  });
});
