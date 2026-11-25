/**
 * The engine9 connect button: one button and one dialog to pick a server,
 * sign in, pick an account, and sign out. It is the MCP counterpart of the
 * login widget (`@engine9/id/widget`) and looks the same: the button shows the
 * signed-in email with the account as its pill, the way the login widget
 * shows a role. In engine9 the account is the role: who may open an account
 * is decided by that account's admin role on the server.
 */
import {
  McpError,
  serverLabel,
  type McpAccount,
  type McpConnection,
  type McpState,
} from './mcp';

export interface McpButtonLabels {
  connect: string;
  connecting: string;
  title: string;
  server: string;
  addServer: string;
  addServerPlaceholder: string;
  signIn: string;
  signInNote: string;
  account: string;
  chooseAccount: string;
  search: string;
  noAccounts: string;
  showing: string;
  signOut: string;
  loading: string;
}

export interface McpButtonOptions {
  mcp: McpConnection;
  /** Element or selector. Default `[data-e9-mcp-button]`, else `<body>`. */
  target?: string | Element;
  labels?: Partial<McpButtonLabels>;
  theme?: 'auto' | 'light' | 'dark';
  /** `redirect` (default) or `popup`; default from the connection. */
  mode?: 'redirect' | 'popup';
  /** Show the search box when there are more accounts than this. Default 8. */
  searchThreshold?: number;
  /** Most accounts listed at once; the search narrows the rest. Default 100. */
  maxListed?: number;
  /** Open the dialog after sign-in when no account is chosen yet. Default true. */
  promptForAccount?: boolean;
  /** The person picked an account. Throw to refuse; the message is shown. */
  onAccountChange?(account: McpAccount | null, state: McpState): void | Promise<void>;
  onError?(error: unknown): void;
}

export interface McpButton {
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  destroy(): void;
}

const DEFAULT_LABELS: McpButtonLabels = {
  connect: 'Connect to engine9',
  connecting: 'Connecting…',
  title: 'engine9',
  server: 'Server',
  addServer: 'Add',
  addServerPlaceholder: 'https://data.example.com/mcp',
  signIn: 'Sign in to {server}',
  signInNote: 'You sign in with Delegate. {server} asks before it lets this site use engine9 as you.',
  account: 'Account',
  chooseAccount: 'Choose an account',
  search: 'Search accounts',
  noAccounts: 'You cannot open any account on this server.',
  showing: 'Showing {shown} of {total}. Search to find the rest.',
  signOut: 'Sign out',
  loading: 'Loading accounts…',
};

const CSS = `
:host {
  --e9-accent: #1a73e8; --e9-accent-fg: #fff;
  --e9-bg: #fff; --e9-fg: #1a1f36; --e9-muted: #5b6275;
  --e9-border: #e3e6ef; --e9-surface: #f3f5fa; --e9-danger: #b42318;
  --e9-font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  display: inline-block;
}
:host([data-theme="dark"]) {
  --e9-bg: #161a23; --e9-fg: #eef1f7; --e9-muted: #a3aabb;
  --e9-border: #2c3242; --e9-surface: #202533; --e9-danger: #f97066;
}
@media (prefers-color-scheme: dark) {
  :host([data-theme="auto"]) {
    --e9-bg: #161a23; --e9-fg: #eef1f7; --e9-muted: #a3aabb;
    --e9-border: #2c3242; --e9-surface: #202533; --e9-danger: #f97066;
  }
}
button, input { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; opacity: .55; }
.trigger {
  display: inline-flex; align-items: center; gap: .5em; max-width: 24em;
  padding: .45em 1em; border-radius: 999px; border: 1px solid var(--e9-border);
  background: var(--e9-bg); color: var(--e9-fg);
}
.trigger:hover { background: var(--e9-surface); }
.trigger .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill {
  flex: none; max-width: 12em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: .72em; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  padding: .15em .55em; border-radius: 999px; background: var(--e9-surface); color: var(--e9-muted);
}
dialog {
  box-sizing: border-box; width: min(420px, calc(100vw - 32px)); max-height: calc(100vh - 32px); padding: 18px 20px 16px;
  border: 1px solid var(--e9-border); border-radius: 16px;
  background: var(--e9-bg); color: var(--e9-fg); font: var(--e9-font);
  box-shadow: 0 24px 64px rgba(10, 14, 30, .28);
}
dialog::backdrop { background: rgba(10, 14, 30, .45); }
.top { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
h2 { margin: 0; font-size: 1.15em; }
.x { margin-left: auto; width: 30px; height: 30px; border: 0; border-radius: 8px; background: transparent; color: var(--e9-muted); font-size: 20px; line-height: 1; }
.x:hover { background: var(--e9-surface); }
h3 { margin: 0 0 6px; font-size: .78em; letter-spacing: .06em; text-transform: uppercase; color: var(--e9-muted); }
p { margin: 0 0 10px; }
.fine { font-size: .85em; color: var(--e9-muted); margin: 6px 0 0; }
section { padding: 12px 0; border-top: 1px solid var(--e9-border); }
.card { padding: 12px 14px; border-radius: 12px; background: var(--e9-surface); margin-bottom: 4px; }
.card .email { font-weight: 600; overflow-wrap: anywhere; }
.btn {
  box-sizing: border-box; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 10px 14px; border-radius: 10px; border: 1px solid var(--e9-border);
  background: var(--e9-bg); color: var(--e9-fg); font-weight: 600;
}
.btn:hover:not(:disabled) { background: var(--e9-surface); }
.btn.primary { background: var(--e9-accent); border-color: var(--e9-accent); color: var(--e9-accent-fg); }
.list { display: grid; gap: 6px; max-height: 300px; overflow: auto; padding: 1px; }
.item { text-align: left; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--e9-border); background: var(--e9-bg); color: var(--e9-fg); }
.item:hover:not(:disabled) { background: var(--e9-surface); }
.item[aria-pressed="true"] { border-color: var(--e9-accent); box-shadow: inset 0 0 0 1px var(--e9-accent); }
.item .name { font-weight: 600; overflow-wrap: anywhere; }
.item .desc { display: block; font-size: .85em; color: var(--e9-muted); overflow-wrap: anywhere; }
.row { display: flex; gap: 8px; margin-top: 8px; }
input[type="search"], input[type="url"] {
  box-sizing: border-box; width: 100%; padding: 8px 10px; border-radius: 10px;
  border: 1px solid var(--e9-border); background: var(--e9-bg); color: var(--e9-fg); margin-bottom: 8px;
}
.row input { margin: 0; }
.row .btn { width: auto; }
.status { margin: 10px 0 0; font-size: .9em; }
.status:empty { display: none; }
.status.err { color: var(--e9-danger); }
`;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

function resolveTarget(target: McpButtonOptions['target']): Element {
  if (target && typeof target !== 'string') return target;
  const found = document.querySelector(target ?? '[data-e9-mcp-button]');
  if (found) return found;
  if (typeof target === 'string') throw new McpError('invalid_request', `mcpButton target ${target} is not on the page`);
  return document.body;
}

/** Text under an account's name: its id, type, and parent's name. */
export function accountDescription(account: McpAccount, byId: Map<string, McpAccount>): string {
  const parent = account.parentIds.map((id) => byId.get(id)?.name ?? id)[0];
  return [account.id, account.type, parent ? `in ${parent}` : null].filter(Boolean).join(' · ');
}

/** Accounts whose name or id contains every word of `query`. */
export function filterAccounts(accounts: McpAccount[], query: string): McpAccount[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return accounts;
  return accounts.filter((a) => {
    const hay = `${a.name} ${a.id} ${a.type ?? ''} ${a.tags.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Put the engine9 connect button on the page.
 *
 * ```js
 * const mcp = connectMcp({ servers: ['https://data.engine9.ai/mcp'] });
 * mcpButton({ mcp, onAccountChange: (account) => render(account) });
 * ```
 */
export function mcpButton(options: McpButtonOptions): McpButton {
  const { mcp } = options;
  const labels: McpButtonLabels = { ...DEFAULT_LABELS, ...options.labels };
  const onError = options.onError ?? ((e: unknown) => console.warn('[engine9/id mcp]', e));
  const searchThreshold = options.searchThreshold ?? 8;
  const maxListed = options.maxListed ?? 100;

  const ui: {
    busy: string | null;
    status: { text: string; kind: 'ok' | 'err' } | null;
    accounts: McpAccount[] | null;
    accountsFor: string | null;
    query: string;
  } = { busy: null, status: null, accounts: null, accountsFor: null, query: '' };

  const host = document.createElement('span');
  host.className = 'e9-mcp-button';
  host.dataset.theme = options.theme ?? 'auto';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${CSS}</style><button class="trigger" part="button" type="button" aria-haspopup="dialog"></button><dialog part="dialog" aria-labelledby="e9-mcp-title"></dialog>`;
  const trigger = shadow.querySelector('.trigger') as HTMLButtonElement;
  const dialog = shadow.querySelector('dialog') as HTMLDialogElement;
  resolveTarget(options.target).appendChild(host);

  const currentAccount = (s: McpState): McpAccount | undefined =>
    s.account ? ui.accounts?.find((a) => a.id === s.account) : undefined;

  const renderTrigger = (s: McpState) => {
    host.dataset.state = s.signedIn ? 'signed-in' : 'signed-out';
    host.dataset.account = s.account ?? '';
    trigger.setAttribute('aria-busy', ui.busy ? 'true' : 'false');
    if (!s.signedIn) {
      trigger.innerHTML = `<span class="who">${esc(ui.busy ? labels.connecting : labels.connect)}</span>`;
      trigger.title = '';
      return;
    }
    const account = currentAccount(s);
    const accountName = account?.name ?? s.account;
    trigger.innerHTML =
      `<span class="who" part="email">${esc(s.email ?? (s.server ? serverLabel(s.server) : ''))}</span>` +
      (accountName ? `<span class="pill" part="account">${esc(accountName)}</span>` : '');
    trigger.title = [s.email, accountName, s.server ? serverLabel(s.server) : null].filter(Boolean).join(' · ');
  };

  const serversSection = (s: McpState): string => {
    const list = mcp.servers();
    if (list.length < 2 && !mcp.options.allowCustomServer) return '';
    const items = list
      .map(
        (server) =>
          `<button class="item" type="button" data-action="server" data-server="${esc(server.url)}" aria-pressed="${server.url === s.server?.url}">` +
          `<span class="name">${esc(serverLabel(server))}</span><span class="desc">${esc(server.url)}${mcp.isSignedIn(server.url) ? ' · signed in' : ''}</span></button>`,
      )
      .join('');
    const add = mcp.options.allowCustomServer
      ? `<form class="row" data-action="add-server"><input type="url" name="url" required placeholder="${esc(labels.addServerPlaceholder)}" aria-label="${esc(labels.server)}"><button class="btn" type="submit">${esc(labels.addServer)}</button></form>`
      : '';
    return `<section><h3>${esc(labels.server)}</h3><div class="list">${items}</div>${add}</section>`;
  };

  const accountItems = (s: McpState): string => {
    if (!ui.accounts) return `<p class="fine">${esc(labels.loading)}</p>`;
    if (!ui.accounts.length) return `<p class="fine">${esc(labels.noAccounts)}</p>`;
    const byId = new Map(ui.accounts.map((a) => [a.id, a]));
    const matches = filterAccounts(ui.accounts, ui.query);
    const shown = matches.slice(0, maxListed);
    const items = shown
      .map(
        (a) =>
          `<button class="item" type="button" data-action="account" data-account="${esc(a.id)}" aria-pressed="${a.id === s.account}">` +
          `<span class="name">${esc(a.name)}</span><span class="desc">${esc(accountDescription(a, byId))}</span></button>`,
      )
      .join('');
    const more = matches.length > shown.length ? `<p class="fine">${esc(fill(labels.showing, { shown: shown.length, total: matches.length }))}</p>` : '';
    return `<div class="list">${items}</div>${more}`;
  };

  const accountSection = (s: McpState): string => {
    const search =
      ui.accounts && ui.accounts.length > searchThreshold
        ? `<input type="search" data-action="search" placeholder="${esc(labels.search)}" aria-label="${esc(labels.search)}" value="${esc(ui.query)}">`
        : '';
    return `<section><h3>${esc(s.account ? labels.account : labels.chooseAccount)}</h3>${search}<div class="accounts">${accountItems(s)}</div></section>`;
  };

  const renderDialog = (s: McpState) => {
    const serverName = s.server ? serverLabel(s.server) : '';
    const body = s.signedIn
      ? `<section><div class="card"><div class="email">${esc(s.email ?? '')}</div><div class="fine">${esc(serverName)}</div></div></section>` +
        accountSection(s) +
        `<section><button class="btn" type="button" data-action="sign-out" ${ui.busy ? 'disabled' : ''}>${esc(labels.signOut)}</button></section>`
      : `<section><button class="btn primary" type="button" data-action="sign-in" ${ui.busy || !s.server ? 'disabled' : ''}>${esc(fill(labels.signIn, { server: serverName }))}</button>` +
        `<p class="fine">${esc(fill(labels.signInNote, { server: serverName }))}</p></section>`;
    dialog.innerHTML =
      `<div class="top"><h2 id="e9-mcp-title">${esc(labels.title)}</h2><button class="x" type="button" data-action="close" aria-label="Close">×</button></div>` +
      serversSection(s) +
      body +
      `<p class="status${ui.status?.kind === 'err' ? ' err' : ''}" role="status">${esc(ui.busy ?? ui.status?.text ?? '')}</p>`;
  };

  const render = () => {
    const s = mcp.state();
    renderTrigger(s);
    if (dialog.open) renderDialog(s);
  };

  const loadAccounts = async (force = false) => {
    const s = mcp.state();
    if (!s.signedIn || !s.server) return;
    if (!force && ui.accountsFor === s.server.url && ui.accounts) return;
    ui.accountsFor = s.server.url;
    ui.accounts = null;
    render();
    try {
      ui.accounts = await mcp.accounts({ refresh: force });
    } catch (e) {
      ui.accounts = [];
      ui.status = { text: e instanceof Error ? e.message : String(e), kind: 'err' };
      onError(e);
    }
    render();
  };

  const run = async (busy: string | null, fn: () => Promise<void>) => {
    ui.busy = busy;
    ui.status = null;
    render();
    try {
      await fn();
    } catch (e) {
      ui.status = { text: e instanceof Error ? e.message : String(e), kind: 'err' };
      onError(e);
    } finally {
      ui.busy = null;
      render();
    }
  };

  const open = () => {
    if (!dialog.open) {
      renderDialog(mcp.state());
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    void loadAccounts();
  };
  const close = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  trigger.addEventListener('click', () => open());

  dialog.addEventListener('click', (event) => {
    const target = (event.target as Element).closest('[data-action]') as HTMLElement | null;
    if (!target) {
      if (event.target === dialog) close();
      return;
    }
    switch (target.dataset.action) {
      case 'close':
        close();
        break;
      case 'server':
        if (target.dataset.server) {
          mcp.selectServer(target.dataset.server);
          ui.accounts = null;
          ui.accountsFor = null;
          ui.query = '';
          void loadAccounts();
        }
        break;
      case 'sign-in':
        void run(labels.connecting, () => mcp.signIn({ mode: options.mode }).then(() => loadAccounts(true)));
        break;
      case 'sign-out':
        void run(null, async () => {
          await mcp.signOut();
          ui.accounts = null;
          ui.accountsFor = null;
          await options.onAccountChange?.(null, mcp.state());
        });
        break;
      case 'account': {
        const id = target.dataset.account;
        const account = ui.accounts?.find((a) => a.id === id) ?? null;
        if (!account) break;
        void run(null, async () => {
          await options.onAccountChange?.(account, { ...mcp.state(), account: account.id });
          mcp.setAccount(account.id);
          close();
        });
        break;
      }
    }
  });

  dialog.addEventListener('input', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action !== 'search') return;
    ui.query = input.value;
    const container = dialog.querySelector('.accounts');
    if (container) container.innerHTML = accountItems(mcp.state());
  });

  dialog.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    if (form.dataset.action !== 'add-server') return;
    event.preventDefault();
    const value = (form.elements.namedItem('url') as HTMLInputElement).value;
    try {
      const server = mcp.addServer(value);
      mcp.selectServer(server.url);
      ui.accounts = null;
      ui.accountsFor = null;
      void loadAccounts();
    } catch (e) {
      ui.status = { text: e instanceof Error ? e.message : String(e), kind: 'err' };
      render();
    }
  });

  const unsubscribe = mcp.onChange(() => render());

  render();
  void mcp.ready.then(() => {
    if (mcp.callbackError) {
      ui.status = { text: mcp.callbackError.message, kind: 'err' };
      open();
      return;
    }
    const s = mcp.state();
    if (s.signedIn) {
      void loadAccounts().then(() => {
        if (options.promptForAccount !== false && !mcp.state().account) open();
      });
    }
  });

  return {
    element: host,
    open,
    close,
    destroy() {
      unsubscribe();
      close();
      host.remove();
    },
  };
}
