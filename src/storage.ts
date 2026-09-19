import type { StorageKind } from './types';

export const STORAGE_KEYS = {
  token: 'delegate_token',
  unid: 'delegate_unid',
  identity: 'delegate_identity',
  nonce: 'delegate_nonce',
  state: 'delegate_state',
  coreSession: 'engine9_core_session',
} as const;

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  clearIdentity(): void;
}

class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.map.set(key, value);
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  clearIdentity(): void {
    for (const key of Object.values(STORAGE_KEYS)) this.map.delete(key);
  }
}

class WebStore implements KeyValueStore {
  constructor(private readonly area: Storage) {}

  get(key: string): string | null {
    try {
      return this.area.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      this.area.setItem(key, value);
    } catch {
      // quota / private mode
    }
  }

  remove(key: string): void {
    try {
      this.area.removeItem(key);
    } catch {
      // ignore
    }
  }

  clearIdentity(): void {
    for (const key of Object.values(STORAGE_KEYS)) this.remove(key);
  }
}

function webStorage(kind: 'session' | 'local'): Storage | null {
  try {
    if (typeof globalThis === 'undefined') return null;
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function createStorage(kind: StorageKind = 'session'): KeyValueStore {
  if (kind === 'memory') return new MemoryStore();
  const area = webStorage(kind);
  if (!area) return new MemoryStore();
  return new WebStore(area);
}
