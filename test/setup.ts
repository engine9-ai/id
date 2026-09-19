import { webcrypto } from 'node:crypto';

import { beforeEach } from 'vitest';

import { clearDiscoveryCache } from '../src/discovery';

const crypto = globalThis.crypto as Crypto | undefined;
if (!crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

beforeEach(() => {
  clearDiscoveryCache();
});
