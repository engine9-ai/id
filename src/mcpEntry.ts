/** `@engine9/id/mcp`: sign in to engine9 MCP servers from a web page. See docs/mcp.md. */
export {
  connectMcp,
  isMcpSignedOut,
  McpError,
  MCP_PROTOCOL_VERSION,
  normalizeServer,
  serverLabel,
  toolResultValue,
} from './mcp';
export type {
  ConnectMcpOptions,
  McpAccount,
  McpCallOptions,
  McpConnection,
  McpServer,
  McpState,
  McpStorage,
  McpUser,
} from './mcp';
export { mcpButton, accountDescription, filterAccounts } from './mcpButton';
export type { McpButton, McpButtonLabels, McpButtonOptions } from './mcpButton';
