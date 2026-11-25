import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { connectMcp, isMcpSignedOut, McpError, normalizeServer, toolResultValue } from '../src/mcp';
import { filterAccounts, mcpButton } from '../src/mcpButton';

const SERVER = 'https://data.example.com/mcp';

const USER = {
  uid: 'data.example.com:abc',
  email: 'alex@example.com',
  isSuperadmin: false,
  accounts: {
    zeta: { name: 'Zeta Fund', type: 'client', parent_ids: ['agency'], disabled: false, tags: [], level: 'admin' },
    agency: { name: 'Agency', type: 'agency', parent_ids: [], disabled: false, tags: ['parent'], level: 'admin' },
    old: { name: 'Old Account', type: null, parent_ids: [], disabled: true, tags: [], level: 'admin' },
  },
};

interface Call {
  url: string;
  init?: RequestInit;
  body?: Record<string, unknown> | URLSearchParams;
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** A fake engine9 API host: discovery, token endpoint, and a stateful /mcp. */
function fakeServer(opts: { user?: unknown; sse?: boolean; unauthorized?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    let body: Call['body'];
    if (typeof init?.body === 'string') {
      body = init.body.startsWith('{') ? JSON.parse(init.body) : new URLSearchParams(init.body);
    }
    calls.push({ url, init, body });
    if (url.endsWith('/.well-known/oauth-protected-resource/mcp')) {
      return json({ resource: SERVER, authorization_servers: ['https://data.example.com'] });
    }
    if (url.endsWith('/.well-known/oauth-authorization-server')) {
      return json({
        authorization_endpoint: 'https://data.example.com/oauth/authorize',
        token_endpoint: 'https://data.example.com/oauth/token',
        revocation_endpoint: 'https://data.example.com/oauth/revoke',
      });
    }
    if (url.endsWith('/oauth/token')) {
      const form = body as URLSearchParams;
      if (form.get('code') !== 'good-code') return json({ error: 'invalid_grant' }, { status: 400 });
      return json({ access_token: 'operator-session', token_type: 'Bearer', expires_in: 3600 });
    }
    if (url.endsWith('/oauth/revoke')) return new Response(null, { status: 200 });
    if (url === SERVER) {
      if (opts.unauthorized) return json({ error: 'Unauthorized' }, { status: 401 });
      const message = body as Record<string, unknown>;
      if (message.method === 'initialize') {
        return json({ jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'engine9.ai' } } }, { headers: { 'mcp-session-id': 'sess-1' } });
      }
      if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (message.method === 'tools/call') {
        const params = message.params as { name: string; arguments: Record<string, unknown> };
        const data = params.name === 'user' ? opts.user ?? USER : { echo: params.arguments };
        const reply = { jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } };
        if (opts.sse) {
          return new Response(`event: message\ndata: ${JSON.stringify(reply)}\n\n`, {
            headers: { 'content-type': 'text/event-stream' },
          });
        }
        return json(reply);
      }
    }
    return new Response('not found', { status: 404 });
  });
  return { fetchImpl, calls };
}

function signedIn() {
  localStorage.setItem(`engine9_mcp_token:${SERVER}`, JSON.stringify({ token: 'operator-session', expiresAt: Date.now() + 60_000 }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/reports?tab=1');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('normalizeServer', () => {
  it('adds /mcp to a bare origin and refuses plain http off loopback', () => {
    expect(normalizeServer('https://data.example.com').url).toBe(SERVER);
    expect(normalizeServer('http://localhost:8443/mcp').url).toBe('http://localhost:8443/mcp');
    expect(() => normalizeServer('http://data.example.com/mcp')).toThrow(McpError);
  });
});

describe('connectMcp sign-in', () => {
  it('sends the browser to /oauth/authorize with PKCE, this origin as client_id, this page as redirect_uri', async () => {
    const { fetchImpl } = fakeServer();
    const navigate = vi.fn();
    const mcp = connectMcp({ servers: [SERVER], fetchImpl, navigate });
    await mcp.ready;
    await mcp.signIn();
    const url = new URL(navigate.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://data.example.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe(`${location.origin}/`);
    expect(url.searchParams.get('redirect_uri')).toBe(`${location.origin}/reports`);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('resource')).toBe(SERVER);
    expect(localStorage.getItem(`engine9_mcp_flow:${url.searchParams.get('state')}`)).toContain('"verifier"');
  });

  it('finishes a sign-in that returns to the page: trades the code and cleans the URL', async () => {
    const { fetchImpl, calls } = fakeServer();
    const navigate = vi.fn();
    const first = connectMcp({ servers: [SERVER], fetchImpl, navigate });
    await first.ready;
    await first.signIn({ returnTo: `${location.origin}/reports?tab=1` });
    const state = new URL(navigate.mock.calls[0][0]).searchParams.get('state');

    history.replaceState(null, '', `/reports?code=good-code&state=${state}`);
    const mcp = connectMcp({ servers: [SERVER], fetchImpl, navigate });
    await mcp.ready;
    expect(mcp.isSignedIn()).toBe(true);
    expect(mcp.getToken()).toBe('operator-session');
    expect(location.search).toBe('');
    const tokenCall = calls.find((c) => c.url.endsWith('/oauth/token'))!;
    const form = tokenCall.body as URLSearchParams;
    expect(form.get('code_verifier')).toBeTruthy();
    expect(form.get('redirect_uri')).toBe(`${location.origin}/reports`);
    expect(navigate).toHaveBeenLastCalledWith(`${location.origin}/reports?tab=1`);
  });

  it('ignores a return it did not start', async () => {
    history.replaceState(null, '', '/reports?code=x&state=not-ours');
    const { fetchImpl } = fakeServer();
    const mcp = connectMcp({ servers: [SERVER], fetchImpl });
    await mcp.ready;
    expect(mcp.isSignedIn()).toBe(false);
    expect(mcp.callbackError).toBeNull();
  });

  it('reports a declined consent screen', async () => {
    const { fetchImpl } = fakeServer();
    const navigate = vi.fn();
    const first = connectMcp({ servers: [SERVER], fetchImpl, navigate });
    await first.ready;
    await first.signIn();
    const state = new URL(navigate.mock.calls[0][0]).searchParams.get('state');
    history.replaceState(null, '', `/reports?error=access_denied&state=${state}`);
    const mcp = connectMcp({ servers: [SERVER], fetchImpl, navigate });
    await mcp.ready;
    expect(mcp.callbackError?.code).toBe('access_denied');
    expect(mcp.isSignedIn()).toBe(false);
  });
});

describe('connectMcp calls', () => {
  it('initializes an MCP session once and adds the selected account to tool calls', async () => {
    signedIn();
    const { fetchImpl, calls } = fakeServer();
    const mcp = connectMcp({ servers: [SERVER], fetchImpl });
    mcp.setAccount('zeta');
    const first = await mcp.call<{ echo: Record<string, unknown> }>('report', { command: 'list' });
    expect(first.echo).toEqual({ command: 'list', account_id: 'zeta' });
    const own = await mcp.call<{ echo: Record<string, unknown> }>('report', { account_id: 'other' });
    expect(own.echo.account_id).toBe('other');
    const none = await mcp.call<{ echo: Record<string, unknown> }>('ok', {}, { accountId: null });
    expect(none.echo).toEqual({});
    const mcpCalls = calls.filter((c) => c.url === SERVER);
    expect(mcpCalls.filter((c) => (c.body as Record<string, unknown>).method === 'initialize')).toHaveLength(1);
    const last = mcpCalls[mcpCalls.length - 1].init!.headers as Record<string, string>;
    expect(last.Authorization).toBe('Bearer operator-session');
    expect(last['mcp-session-id']).toBe('sess-1');
  });

  it('reads text/event-stream responses', async () => {
    signedIn();
    const { fetchImpl } = fakeServer({ sse: true });
    const mcp = connectMcp({ servers: [SERVER], fetchImpl });
    expect(await mcp.call('report', {}, { accountId: null })).toEqual({ echo: {} });
  });

  it('lists enabled accounts by name from the user tool', async () => {
    signedIn();
    const { fetchImpl } = fakeServer();
    const mcp = connectMcp({ servers: [SERVER], fetchImpl });
    const accounts = await mcp.accounts();
    expect(accounts.map((a) => a.id)).toEqual(['agency', 'zeta']);
    expect(accounts[1].parentIds).toEqual(['agency']);
    expect((await mcp.accounts({ includeDisabled: true })).map((a) => a.id)).toContain('old');
    expect(mcp.state().email).toBe('alex@example.com');
  });

  it('forgets the token on 401 and says signed_out', async () => {
    signedIn();
    const { fetchImpl } = fakeServer({ unauthorized: true });
    const mcp = connectMcp({ servers: [SERVER], fetchImpl });
    const error = await mcp.call('user').catch((e) => e);
    expect(isMcpSignedOut(error)).toBe(true);
    expect(mcp.isSignedIn()).toBe(false);
  });

  it('signs out and revokes the token', async () => {
    signedIn();
    const { fetchImpl, calls } = fakeServer();
    const mcp = connectMcp({ servers: [SERVER], fetchImpl });
    mcp.setAccount('zeta');
    await mcp.signOut();
    expect(mcp.isSignedIn()).toBe(false);
    expect(mcp.account()).toBeNull();
    expect(calls.some((c) => c.url.endsWith('/oauth/revoke'))).toBe(true);
  });

  it('keeps a token per server', () => {
    signedIn();
    const other = 'https://data.other.org/mcp';
    const mcp = connectMcp({ servers: [SERVER, other], fetchImpl: fakeServer().fetchImpl });
    expect(mcp.isSignedIn(SERVER)).toBe(true);
    mcp.selectServer(other);
    expect(mcp.isSignedIn()).toBe(false);
    expect(mcp.state().server?.url).toBe(other);
  });
});

describe('toolResultValue', () => {
  it('prefers structuredContent, then JSON text, then text', () => {
    expect(toolResultValue({ structuredContent: { a: 1 } })).toEqual({ a: 1 });
    expect(toolResultValue({ content: [{ type: 'text', text: '{"b":2}' }] })).toEqual({ b: 2 });
    expect(toolResultValue({ content: [{ type: 'text', text: 'plain' }] })).toBe('plain');
  });
});

describe('mcpButton', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('says Connect when signed out and opens a sign-in dialog', async () => {
    const mcp = connectMcp({ servers: [SERVER], fetchImpl: fakeServer().fetchImpl, navigate: vi.fn() });
    const button = mcpButton({ mcp });
    const root = button.element.shadowRoot!;
    expect(root.querySelector('.trigger')!.textContent).toContain('Connect to engine9');
    expect(button.element.dataset.state).toBe('signed-out');
    button.open();
    expect(root.querySelector('[data-action="sign-in"]')!.textContent).toContain('data.example.com');
  });

  it('shows the email with the account as its pill, and picks an account', async () => {
    signedIn();
    const mcp = connectMcp({ servers: [SERVER], fetchImpl: fakeServer().fetchImpl });
    const onAccountChange = vi.fn();
    const button = mcpButton({ mcp, onAccountChange });
    const root = button.element.shadowRoot!;
    await mcp.ready;
    await flush();
    await flush();
    // Signed in with no account: the dialog opens to choose one.
    const items = [...root.querySelectorAll<HTMLButtonElement>('[data-action="account"]')];
    expect(items.map((b) => b.dataset.account)).toEqual(['agency', 'zeta']);
    expect(items[1].textContent).toContain('in Agency');
    items[1].click();
    await flush();
    expect(onAccountChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'zeta' }), expect.objectContaining({ account: 'zeta' }));
    expect(mcp.account()).toBe('zeta');
    expect(root.querySelector('[part="email"]')!.textContent).toBe('alex@example.com');
    expect(root.querySelector('[part="account"]')!.textContent).toBe('Zeta Fund');
    expect(button.element.dataset.account).toBe('zeta');
  });

  it('lists servers when there is more than one', () => {
    const mcp = connectMcp({ servers: [SERVER, 'https://data.other.org/mcp'], fetchImpl: fakeServer().fetchImpl });
    const button = mcpButton({ mcp });
    button.open();
    const servers = button.element.shadowRoot!.querySelectorAll('[data-action="server"]');
    expect(servers).toHaveLength(2);
  });
});

describe('filterAccounts', () => {
  it('matches every word against name, id, type and tags', () => {
    const accounts = [
      { id: 'a1', name: 'Acme Action', type: 'client', parentIds: [], disabled: false, tags: ['east'], level: 'admin' },
      { id: 'b2', name: 'Beta Fund', type: 'client', parentIds: [], disabled: false, tags: [], level: 'admin' },
    ];
    expect(filterAccounts(accounts, 'acme east').map((a) => a.id)).toEqual(['a1']);
    expect(filterAccounts(accounts, 'b2').map((a) => a.id)).toEqual(['b2']);
    expect(filterAccounts(accounts, '')).toHaveLength(2);
  });
});
