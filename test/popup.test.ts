import { describe, expect, it } from 'vitest';

import { listenForDelegateIdentity } from '../src/popup';
import { postMessage } from './helpers';

const DELEGATE = 'https://delegate.engine9.ai';

describe('listenForDelegateIdentity', () => {
  it('ignores messages from the wrong origin', async () => {
    const pending = listenForDelegateIdentity({ expectedOrigin: DELEGATE });
    postMessage('https://evil.example', {
      type: 'delegate-identity',
      token: 'evil-token',
    });
    postMessage(DELEGATE, { type: 'delegate-profile', token: 'legacy' });
    postMessage(DELEGATE, { type: 'delegate-identity', token: 'good-token', state: 's' });
    await expect(pending).resolves.toEqual({ token: 'good-token', state: 's' });
  });

  it('ignores non-identity message types from the delegate origin', async () => {
    const pending = listenForDelegateIdentity({ expectedOrigin: DELEGATE });
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    postMessage(DELEGATE, { type: 'delegate-profile', unid: 'u1' });
    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false);
    postMessage(DELEGATE, { type: 'delegate-identity', token: 'ok' });
    await expect(pending).resolves.toEqual({ token: 'ok', state: undefined });
  });
});
