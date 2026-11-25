/**
 * `@engine9/id/mcp` — sign in to an engine9 MCP server from a web page and call
 * its tools. Browser only; no server code, no registration.
 *
 * The MCP server is an OAuth 2.1 authorization server in front of Delegate.
 * This module is a public OAuth client of it (authorization code + PKCE,
 * the flow every MCP client uses): it discovers the server's endpoints, sends
 * the person to sign in (Delegate, then a consent screen naming this site's
 * origin), trades the code for a bearer token, and sends JSON-RPC to `/mcp`.
 *
 * The token belongs to one MCP server; each server keeps its own. The
 * "account" is the engine9 account (warehouse) tool calls act on: the
 * accounts list comes from the server's `user` tool, and access is enforced
 * by the server, never by this module.
 *
 * Wire details: docs/mcp.md.
 */
import { bytesToBase64Url } from './base64url';
import { randomId } from './random';
import type { FetchImpl } from './types';

export const MCP_PROTOCOL_VERSION = '2025-06-18';

/** One engine9 MCP server: its `/mcp` endpoint URL. */
export interface McpServer {
  /** The MCP endpoint, e.g. `https://data.engine9.ai/mcp`. */
  url: string;
  /** Shown in the server list. Default: the host. */
  name?: string;
}

/** An engine9 account the signed-in person may open on one server. */
export interface McpAccount {
  /** `account_id`: what tool calls take. */
  id: string;
  name: string;
  type: string | null;
  parentIds: string[];
  disabled: boolean;
  tags: string[];
  /** How the person may open it: `superadmin` (every account) or `admin`. */
  level: string | null;
}

export interface McpUser {
  uid: string;
  email: string | null;
  isSuperadmin: boolean;
  accounts: McpAccount[];
}

export interface McpState {
  server: McpServer | null;
  signedIn: boolean;
  email: string | null;
  /** Selected account id on the current server. */
  account: string | null;
}

export type McpStorage = 'local' | 'session' | 'memory';

export interface ConnectMcpOptions {
  /** MCP endpoint URLs (or `{ url, name }`). The first is selected by default. */
  servers: Array<string | McpServer>;
  /** Let the person type another server URL in the connect button. Default false. */
  allowCustomServer?: boolean;
  /**
   * OAuth client_id. Default: this page's origin as a URL (`https://app.example/`).
   * For a website it must be an https URL on the same origin as `redirectUri`;
   * it may point at a client metadata document (`client_name`, `redirect_uris`).
   */
  clientId?: string;
  /** Where the server sends the browser back. Default: this page without its query or hash. */
  redirectUri?: string;
  /** `redirect` (default) leaves the page; `popup` signs in in a small window. */
  mode?: 'redirect' | 'popup';
  /** Where tokens and the selected account are kept. Default `local`. */
  storage?: McpStorage;
  /** Shown to the server as the MCP client name. Default: this page's host. */
  clientName?: string;
  fetchImpl?: FetchImpl;
  /** How to leave the page for sign-in. Default `location.assign`. */
  navigate?: (url: string) => void;
}

export interface McpCallOptions {
  /** Account for this call. Default: the selected account. `null` sends none. */
  accountId?: string | null;
  server?: string;
}

export interface McpConnection {
  readonly options: Readonly<ConnectMcpOptions>;
  /** Resolves once a sign-in returning to this page has been finished (or there was none). */
  readonly ready: Promise<void>;
  /** Why the sign-in that returned to this page failed (`access_denied`, …), or null. */
  readonly callbackError: McpError | null;
  servers(): McpServer[];
  /** Add a server the person typed (needs `allowCustomServer`). Returns it. */
  addServer(url: string): McpServer;
  server(): McpServer | null;
  selectServer(url: string): void;
  isSignedIn(server?: string): boolean;
  state(): McpState;
  /** Send the person to sign in to the selected (or given) server. */
  signIn(opts?: { server?: string; mode?: 'redirect' | 'popup'; returnTo?: string }): Promise<void>;
  /** Finish a sign-in that returned to this page. Called by `connectMcp` itself. */
  handleCallback(search?: string): Promise<boolean>;
  /** Forget this server's token (and revoke it, best effort). */
  signOut(server?: string): Promise<void>;
  /** The signed-in person and the accounts they may open (cached; `refresh` reloads). */
  user(opts?: { refresh?: boolean; server?: string }): Promise<McpUser>;
  /** Enabled accounts, sorted by name. */
  accounts(opts?: { refresh?: boolean; includeDisabled?: boolean; server?: string }): Promise<McpAccount[]>;
  account(): string | null;
  setAccount(accountId: string | null): void;
  /** Call one MCP tool. `account_id` is added from the selected account unless the arguments set it. */
  call<T = unknown>(tool: string, args?: Record<string, unknown>, opts?: McpCallOptions): Promise<T>;
  /** Raw JSON-RPC request (initializes the MCP session first). */
  request<T = unknown>(method: string, params?: unknown, opts?: { server?: string }): Promise<T>;
  /** The bearer token for a server, for your own fetches to it. */
  getToken(server?: string): string | null;
  onChange(listener: (state: McpState) => void): () => void;
}

/** Errors from this module carry a `code`. `signed_out` means: sign in again. */
export class McpError extends Error {
  readonly code: string;
  readonly status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.status = status;
  }
}

export function isMcpSignedOut(error: unknown): boolean {
  return error instanceof McpError && error.code === 'signed_out';
}

interface StoredToken {
  token: string;
  /** Epoch ms. */
  expiresAt: number | null;
}

interface Flow {
  state: string;
  verifier: string;
  server: string;
  clientId: string;
  redirectUri: string;
  tokenEndpoint: string;
  returnTo: string | null;
  popup: boolean;
  createdAt: number;
}

interface AuthEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
}

const KEY_PREFIX = 'engine9_mcp';
const FLOW_TTL_MS = 20 * 60 * 1000;
const POPUP_MESSAGE = 'engine9-mcp-signed-in';

// ---------------------------------------------------------------- storage

interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

function memoryStore(): Store {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

function webStore(kind: 'localStorage' | 'sessionStorage'): Store | null {
  try {
    const area = typeof window === 'undefined' ? undefined : window[kind];
    if (!area) return null;
    return {
      get: (k) => {
        try {
          return area.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          area.setItem(k, v);
        } catch {
          /* quota or blocked */
        }
      },
      remove: (k) => {
        try {
          area.removeItem(k);
        } catch {
          /* blocked */
        }
      },
      keys: () => {
        try {
          return Array.from({ length: area.length }, (_, i) => area.key(i) ?? '').filter(Boolean);
        } catch {
          return [];
        }
      },
    };
  } catch {
    return null;
  }
}

function readJson<T>(store: Store, key: string): T | null {
  const raw = store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- helpers

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== 'function') throw new McpError('unsupported', 'fetch is required');
  return fetch(input, init);
}

export function normalizeServer(server: string | McpServer): McpServer {
  const raw = typeof server === 'string' ? { url: server } : server;
  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    throw new McpError('invalid_server', `Not a URL: ${raw.url}`);
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new McpError('invalid_server', `An engine9 MCP server must use https: ${raw.url}`);
  }
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/mcp';
  url.hash = '';
  url.search = '';
  return { url: url.toString(), ...(raw.name ? { name: raw.name } : {}) };
}

export function serverLabel(server: McpServer): string {
  return server.name || new URL(server.url).host;
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

function pageWithoutQuery(): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

function toAccounts(map: unknown): McpAccount[] {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map as Record<string, Record<string, unknown>>).map(([id, a]) => ({
    id,
    name: typeof a?.name === 'string' && a.name ? a.name : id,
    type: typeof a?.type === 'string' ? a.type : null,
    parentIds: Array.isArray(a?.parent_ids) ? (a.parent_ids as unknown[]).map(String) : [],
    disabled: a?.disabled === true,
    tags: Array.isArray(a?.tags) ? (a.tags as unknown[]).map(String) : [],
    level: typeof a?.level === 'string' ? a.level : null,
  }));
}

/** Read one JSON-RPC message for `id` from a JSON or text/event-stream body. */
async function readRpc(response: Response, id: number): Promise<Record<string, unknown> | null> {
  const type = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!text.trim()) return null;
  if (!type.includes('text/event-stream')) return JSON.parse(text) as Record<string, unknown>;
  let found: Record<string, unknown> | null = null;
  for (const block of text.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try {
      const message = JSON.parse(data) as Record<string, unknown>;
      if (message.id === id) found = message;
    } catch {
      /* not JSON */
    }
  }
  return found;
}

/** A tool result's payload: `structuredContent`, else JSON in its first text block, else the text. */
export function toolResultValue(result: Record<string, unknown> | undefined): unknown {
  if (!result) return null;
  if (result.structuredContent !== undefined) return result.structuredContent;
  const content = Array.isArray(result.content) ? (result.content as Array<Record<string, unknown>>) : [];
  const text = content.find((c) => c?.type === 'text')?.text;
  if (typeof text !== 'string') return content;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------- client

/**
 * Connect a page to one or more engine9 MCP servers.
 *
 * ```js
 * const mcp = connectMcp({ servers: ['https://data.engine9.ai/mcp'] });
 * await mcp.ready;                       // finishes a sign-in returning here
 * if (!mcp.isSignedIn()) await mcp.signIn();
 * const accounts = await mcp.accounts();
 * mcp.setAccount(accounts[0].id);
 * const report = await mcp.call('report', { command: 'list' });
 * ```
 */
export function connectMcp(options: ConnectMcpOptions): McpConnection {
  if (!options || !Array.isArray(options.servers) || options.servers.length === 0) {
    throw new McpError('invalid_request', 'connectMcp needs at least one server');
  }
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const navigate = options.navigate ?? ((url: string) => window.location.assign(url));
  const store: Store =
    (options.storage === 'memory'
      ? null
      : webStore(options.storage === 'session' ? 'sessionStorage' : 'localStorage')) ?? memoryStore();
  // Flows outlive one window (popup sign-in), so they are always in localStorage when it exists.
  const flowStore: Store = webStore('localStorage') ?? store;

  const servers: McpServer[] = [];
  const addKnown = (server: McpServer): McpServer => {
    const existing = servers.find((s) => s.url === server.url);
    if (existing) return existing;
    servers.push(server);
    return server;
  };
  for (const s of options.servers) addKnown(normalizeServer(s));
  if (options.allowCustomServer) {
    for (const url of readJson<string[]>(store, `${KEY_PREFIX}_custom_servers`) ?? []) {
      try {
        addKnown(normalizeServer(url));
      } catch {
        /* ignore a bad saved entry */
      }
    }
  }

  const tokenKey = (url: string) => `${KEY_PREFIX}_token:${url}`;
  const accountKey = (url: string) => `${KEY_PREFIX}_account:${url}`;
  const selectedKey = `${KEY_PREFIX}_server`;

  let selected: string | null = (() => {
    const saved = store.get(selectedKey);
    return saved && servers.some((s) => s.url === saved) ? saved : servers[0].url;
  })();

  const sessions = new Map<string, Promise<string | null>>();
  const users = new Map<string, Promise<McpUser>>();
  const endpoints = new Map<string, Promise<AuthEndpoints>>();
  const listeners = new Set<(state: McpState) => void>();
  let rpcId = 1;

  const resolveServer = (url?: string): string => {
    if (url) return normalizeServer(url).url;
    if (!selected) throw new McpError('invalid_request', 'No engine9 server selected');
    return selected;
  };

  const readToken = (url: string): StoredToken | null => {
    const stored = readJson<StoredToken>(store, tokenKey(url));
    if (!stored?.token) return null;
    if (stored.expiresAt && stored.expiresAt <= Date.now()) {
      store.remove(tokenKey(url));
      return null;
    }
    return stored;
  };

  const cachedEmail = new Map<string, string | null>();

  const state = (): McpState => {
    const server = servers.find((s) => s.url === selected) ?? null;
    const signedIn = server ? Boolean(readToken(server.url)) : false;
    return {
      server,
      signedIn,
      email: server && signedIn ? cachedEmail.get(server.url) ?? null : null,
      account: server && signedIn ? store.get(accountKey(server.url)) : null,
    };
  };

  const emit = () => {
    const s = state();
    for (const listener of [...listeners]) {
      try {
        listener(s);
      } catch {
        /* a listener's error is its own */
      }
    }
  };

  const forget = (url: string) => {
    store.remove(tokenKey(url));
    sessions.delete(url);
    users.delete(url);
    cachedEmail.delete(url);
  };

  async function discover(url: string): Promise<AuthEndpoints> {
    let pending = endpoints.get(url);
    if (!pending) {
      pending = (async () => {
        const mcpUrl = new URL(url);
        let issuer = mcpUrl.origin;
        try {
          const prm = await fetchImpl(
            `${mcpUrl.origin}/.well-known/oauth-protected-resource${mcpUrl.pathname}`,
            { headers: { Accept: 'application/json' } },
          );
          if (prm.ok) {
            const doc = (await prm.json()) as { authorization_servers?: string[] };
            if (doc.authorization_servers?.[0]) issuer = doc.authorization_servers[0].replace(/\/$/, '');
          }
        } catch {
          /* conventional paths below */
        }
        try {
          const asm = await fetchImpl(`${issuer}/.well-known/oauth-authorization-server`, {
            headers: { Accept: 'application/json' },
          });
          if (asm.ok) {
            const doc = (await asm.json()) as Partial<AuthEndpoints>;
            if (doc.authorization_endpoint && doc.token_endpoint) return doc as AuthEndpoints;
          }
        } catch {
          /* conventional paths below */
        }
        return {
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          revocation_endpoint: `${issuer}/oauth/revoke`,
        };
      })();
      pending.catch(() => endpoints.delete(url));
      endpoints.set(url, pending);
    }
    return pending;
  }

  function clientIdFor(): string {
    return options.clientId ?? `${window.location.origin}/`;
  }

  async function signIn(opts: { server?: string; mode?: 'redirect' | 'popup'; returnTo?: string } = {}) {
    const url = resolveServer(opts.server);
    const popup = (opts.mode ?? options.mode ?? 'redirect') === 'popup';
    // Open the window inside the click, before any await, so popup blockers allow it.
    const win = popup ? window.open('about:blank', 'engine9-mcp-sign-in', 'width=520,height=720') : null;
    if (popup && !win) throw new McpError('popup_blocked', 'The browser blocked the sign-in window');
    try {
      const meta = await discover(url);
      const verifier = randomId(48);
      const stateValue = randomId(16);
      const redirectUri = options.redirectUri ?? pageWithoutQuery();
      const flow: Flow = {
        state: stateValue,
        verifier,
        server: url,
        clientId: clientIdFor(),
        redirectUri,
        tokenEndpoint: meta.token_endpoint,
        returnTo: popup ? null : opts.returnTo ?? window.location.href,
        popup,
        createdAt: Date.now(),
      };
      flowStore.set(`${KEY_PREFIX}_flow:${stateValue}`, JSON.stringify(flow));
      const authorize = new URL(meta.authorization_endpoint);
      authorize.searchParams.set('response_type', 'code');
      authorize.searchParams.set('client_id', flow.clientId);
      authorize.searchParams.set('redirect_uri', redirectUri);
      authorize.searchParams.set('code_challenge', await pkceChallenge(verifier));
      authorize.searchParams.set('code_challenge_method', 'S256');
      authorize.searchParams.set('state', stateValue);
      authorize.searchParams.set('resource', url);
      if (!popup) {
        navigate(authorize.toString());
        return;
      }
      win!.location.href = authorize.toString();
      await waitForPopup(win!, url);
    } catch (error) {
      win?.close();
      throw error;
    }
  }

  function waitForPopup(win: Window, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = (fn: () => void) => {
        window.removeEventListener('message', onMessage);
        window.clearInterval(timer);
        fn();
      };
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data as { type?: string; server?: string; error?: string } | null;
        if (data?.type !== POPUP_MESSAGE || data.server !== url) return;
        done(() => {
          if (data.error) reject(new McpError('sign_in_failed', data.error));
          else {
            emit();
            resolve();
          }
        });
      };
      const timer = window.setInterval(() => {
        if (!win.closed) return;
        done(() => {
          if (readToken(url)) {
            emit();
            resolve();
          } else reject(new McpError('sign_in_cancelled', 'The sign-in window was closed'));
        });
      }, 500);
      window.addEventListener('message', onMessage);
    });
  }

  async function handleCallback(search = typeof window === 'undefined' ? '' : window.location.search) {
    const params = new URLSearchParams(search);
    const stateValue = params.get('state');
    if (!stateValue) return false;
    const key = `${KEY_PREFIX}_flow:${stateValue}`;
    const flow = readJson<Flow>(flowStore, key);
    if (!flow) return false; // not ours (or another tab already finished it)
    flowStore.remove(key);
    const cleanUrl = () => {
      if (typeof history !== 'undefined' && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        for (const name of ['code', 'state', 'error', 'error_description', 'iss']) url.searchParams.delete(name);
        history.replaceState(history.state, '', url.toString());
      }
    };
    const finishPopup = (error?: string) => {
      if (flow.popup && window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: POPUP_MESSAGE, server: flow.server, ...(error ? { error } : {}) }, window.location.origin);
        window.close();
      }
    };
    try {
      if (Date.now() - flow.createdAt > FLOW_TTL_MS) throw new McpError('sign_in_expired', 'This sign-in took too long. Sign in again.');
      const error = params.get('error');
      if (error) {
        throw new McpError(
          error === 'access_denied' ? 'access_denied' : 'sign_in_failed',
          params.get('error_description') || `Sign-in was not completed (${error})`,
        );
      }
      const code = params.get('code');
      if (!code) throw new McpError('sign_in_failed', 'The server did not return a code');
      const response = await fetchImpl(flow.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          code_verifier: flow.verifier,
          redirect_uri: flow.redirectUri,
          client_id: flow.clientId,
        }).toString(),
      });
      const json = (await response.json().catch(() => ({}))) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !json.access_token) {
        throw new McpError('sign_in_failed', json.error_description || json.error || `Token request failed (${response.status})`);
      }
      const stored: StoredToken = {
        token: json.access_token,
        expiresAt: typeof json.expires_in === 'number' ? Date.now() + json.expires_in * 1000 : null,
      };
      forget(flow.server);
      store.set(tokenKey(flow.server), JSON.stringify(stored));
      if (!servers.some((s) => s.url === flow.server)) addKnown({ url: flow.server });
      selected = flow.server;
      store.set(selectedKey, flow.server);
      cleanUrl();
      finishPopup();
      emit();
      if (!flow.popup && flow.returnTo && flow.returnTo !== window.location.href) {
        try {
          const back = new URL(flow.returnTo);
          if (back.origin === window.location.origin) navigate(back.toString());
        } catch {
          /* stay */
        }
      }
      return true;
    } catch (error) {
      cleanUrl();
      finishPopup(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async function post(url: string, message: Record<string, unknown>, sessionId: string | null): Promise<Response> {
    const token = readToken(url);
    if (!token) throw new McpError('signed_out', `Not signed in to ${new URL(url).host}`);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token.token}`,
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(message) });
    if (response.status === 401) {
      forget(url);
      emit();
      throw new McpError('signed_out', 'The engine9 session ended. Sign in again.', 401);
    }
    return response;
  }

  function mcpSession(url: string): Promise<string | null> {
    let pending = sessions.get(url);
    if (!pending) {
      pending = (async () => {
        const id = rpcId++;
        const response = await post(
          url,
          {
            jsonrpc: '2.0',
            id,
            method: 'initialize',
            params: {
              protocolVersion: MCP_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: {
                name: options.clientName ?? (typeof location !== 'undefined' ? location.host : 'engine9-id'),
                version: '1',
              },
            },
          },
          null,
        );
        if (!response.ok) throw new McpError('mcp_error', `MCP initialize failed (${response.status})`, response.status);
        const sessionId = response.headers.get('mcp-session-id');
        await readRpc(response, id);
        await post(url, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
        return sessionId;
      })();
      pending.catch(() => sessions.delete(url));
      sessions.set(url, pending);
    }
    return pending;
  }

  async function request<T>(method: string, params?: unknown, opts: { server?: string } = {}): Promise<T> {
    const url = resolveServer(opts.server);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sessionId = await mcpSession(url);
      const id = rpcId++;
      const response = await post(url, { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }, sessionId);
      if ((response.status === 404 || response.status === 400) && attempt === 0 && sessionId) {
        // The server forgot the MCP session (restart): start a new one once.
        sessions.delete(url);
        continue;
      }
      if (!response.ok) throw new McpError('mcp_error', `MCP ${method} failed (${response.status})`, response.status);
      const message = await readRpc(response, id);
      if (!message) throw new McpError('mcp_error', `MCP ${method} returned nothing`);
      if (message.error) {
        const err = message.error as { message?: string; code?: number };
        throw new McpError('mcp_error', err.message || `MCP ${method} failed`);
      }
      return message.result as T;
    }
    throw new McpError('mcp_error', `MCP ${method} failed`);
  }

  async function call<T>(tool: string, args: Record<string, unknown> = {}, opts: McpCallOptions = {}): Promise<T> {
    const url = resolveServer(opts.server);
    const accountId = opts.accountId === undefined ? store.get(accountKey(url)) : opts.accountId;
    const finalArgs = accountId && args.account_id === undefined ? { ...args, account_id: accountId } : args;
    const result = await request<Record<string, unknown>>('tools/call', { name: tool, arguments: finalArgs }, { server: url });
    const value = toolResultValue(result);
    if (result?.isError) {
      const message =
        typeof value === 'string'
          ? value
          : (value as { error?: string; message?: string })?.error ?? (value as { message?: string })?.message ?? `${tool} failed`;
      throw new McpError('tool_error', String(message));
    }
    return value as T;
  }

  function user(opts: { refresh?: boolean; server?: string } = {}): Promise<McpUser> {
    const url = resolveServer(opts.server);
    let pending = opts.refresh ? undefined : users.get(url);
    if (!pending) {
      pending = call<Record<string, unknown>>('user', {}, { server: url, accountId: null }).then((data) => {
        const u: McpUser = {
          uid: String(data?.uid ?? ''),
          email: typeof data?.email === 'string' ? data.email : null,
          isSuperadmin: data?.isSuperadmin === true,
          accounts: toAccounts(data?.accounts),
        };
        cachedEmail.set(url, u.email);
        const chosen = store.get(accountKey(url));
        if (chosen && !u.accounts.some((a) => a.id === chosen)) store.remove(accountKey(url));
        emit();
        return u;
      });
      pending.catch(() => users.delete(url));
      users.set(url, pending);
    }
    return pending;
  }

  const connection: McpConnection = {
    options,
    ready: Promise.resolve(),
    callbackError: null,
    servers: () => [...servers],
    addServer(url) {
      if (!options.allowCustomServer) throw new McpError('invalid_request', 'Custom servers are not allowed here');
      const server = addKnown(normalizeServer(url));
      const custom = servers.filter((s) => !options.servers.some((o) => normalizeServer(o).url === s.url));
      store.set(`${KEY_PREFIX}_custom_servers`, JSON.stringify(custom.map((s) => s.url)));
      emit();
      return server;
    },
    server: () => servers.find((s) => s.url === selected) ?? null,
    selectServer(url) {
      const normalized = normalizeServer(url).url;
      if (!servers.some((s) => s.url === normalized)) throw new McpError('invalid_request', `Unknown server: ${url}`);
      selected = normalized;
      store.set(selectedKey, normalized);
      emit();
    },
    isSignedIn: (url) => Boolean(readToken(resolveServer(url))),
    state,
    signIn,
    handleCallback,
    async signOut(url) {
      const target = resolveServer(url);
      const token = readToken(target);
      forget(target);
      store.remove(accountKey(target));
      emit();
      if (!token) return;
      try {
        const meta = await discover(target);
        if (meta.revocation_endpoint) {
          await fetchImpl(meta.revocation_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: token.token }).toString(),
          });
        }
      } catch {
        /* the token expires on its own */
      }
    },
    user,
    async accounts(opts = {}) {
      const u = await user({ refresh: opts.refresh, server: opts.server });
      return u.accounts
        .filter((a) => opts.includeDisabled || !a.disabled)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    account: () => (selected && readToken(selected) ? store.get(accountKey(selected)) : null),
    setAccount(accountId) {
      const url = resolveServer();
      if (accountId) store.set(accountKey(url), accountId);
      else store.remove(accountKey(url));
      emit();
    },
    call,
    request,
    getToken: (url) => readToken(resolveServer(url))?.token ?? null,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // Drop flows nobody finished.
  for (const key of flowStore.keys()) {
    if (!key.startsWith(`${KEY_PREFIX}_flow:`)) continue;
    const flow = readJson<Flow>(flowStore, key);
    if (!flow || Date.now() - flow.createdAt > FLOW_TTL_MS) flowStore.remove(key);
  }

  const ready =
    typeof window === 'undefined'
      ? Promise.resolve()
      : handleCallback().then(
          () => undefined,
          (error) => {
            (connection as { callbackError: McpError | null }).callbackError =
              error instanceof McpError ? error : new McpError('sign_in_failed', String(error));
            if (typeof console !== 'undefined') console.warn('[engine9/id mcp]', error);
            emit();
          },
        );
  (connection as { ready: Promise<void> }).ready = ready;
  return connection;
}
