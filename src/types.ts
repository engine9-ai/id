export const DEFAULT_DELEGATE_URL = 'https://delegate.engine9.ai';

export type StorageKind = 'session' | 'local' | 'memory';

export type IdentityMode = 'redirect' | 'popup';

export type Prompt = 'none' | 'select' | 'consent' | 'login';

export type ResponseMode = 'fragment' | 'query';

export type FetchImpl = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface IdentityProfile {
  id: string;
  display_name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  email_verified?: boolean;
  phone?: string;
  phone_verified?: boolean;
  attributes?: Record<string, unknown>;
}

export interface IdentityAuth {
  provider?: string;
  amr?: string[];
  auth_time?: number;
  two_factor?: boolean;
}

export interface IdentityGrant {
  id: string;
  granted_at: string | number;
  fields: string[];
}

/** Verified Identity Token payload (protocol claims). */
export interface Identity {
  unid: string;
  level: number;
  profile?: IdentityProfile;
  auth?: IdentityAuth;
  grant?: IdentityGrant;
  sub: string;
  exp: number;
  iss?: string;
  aud?: string | string[];
  iat?: number;
  jti?: string;
  nonce?: string;
  verified_claims?: unknown;
}

export interface CoreConfig {
  apiUrl: string;
  publicApiKey: string;
}

/** Minimal provider surface accepted on createEngine9Id (avoids circular imports). */
export interface Engine9IdProvider {
  readonly id: string;
  discover(): Promise<DelegateConfiguration>;
  buildAuthorizeUrl(opts: {
    site: string;
    returnTo: string;
    minLevel?: number;
    maxLevel?: number;
    fields?: string[];
    prompt?: Prompt;
    nonce?: string;
    state?: string;
    responseMode?: ResponseMode;
  }): Promise<string> | string;
  buildBridgeUrl?(opts: {
    site: string;
    minLevel?: number;
    maxLevel?: number;
    fields?: string[];
    prompt?: Prompt;
    nonce?: string;
    state?: string;
  }): Promise<string> | string;
  buildLogoutUrl?(opts: {
    site: string;
    returnTo?: string;
  }): Promise<string> | string;
  messageOrigin?(config: DelegateConfiguration): string;
  verifyToken(
    token: string,
    opts: { site: string; nonce?: string },
  ): Promise<Identity>;
}

export interface Engine9IdConfig {
  /**
   * Identity provider. Default: Delegate via `createDelegateProvider`.
   * Custom providers must return the normalized Identity shape.
   */
  provider?: Engine9IdProvider;
  /** Delegate origin shortcut when using the default provider. Default `https://delegate.engine9.ai`. */
  delegateUrl?: string;
  /** This Site's origin. Default `location.origin`. JWT `aud` must match. */
  site?: string;
  /** Where to persist the token. Default `session`. */
  storage?: StorageKind;
  /** Optional `@engine9/core` Site API. */
  core?: CoreConfig;
  fetchImpl?: FetchImpl;
}

export interface RequestIdentityOptions {
  minLevel: number;
  maxLevel?: number;
  fields?: string[];
  prompt?: Prompt;
  mode: IdentityMode;
  returnTo?: string;
  responseMode?: ResponseMode;
}

export interface EnsureLevelOptions {
  mode?: IdentityMode;
  maxLevel?: number;
  fields?: string[];
  prompt?: Prompt;
  returnTo?: string;
  responseMode?: ResponseMode;
}

export interface Jwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  kid?: string;
  alg?: string;
  use?: string;
  [key: string]: unknown;
}

export interface Jwks {
  keys: Jwk[];
}

export interface DelegateConfiguration {
  issuer: string;
  jwks_uri: string;
  identity_authorize_endpoint: string;
  identity_bridge_endpoint: string;
  logout_endpoint: string;
  profile_endpoint?: string;
  levels_supported?: number[];
  token_signing_alg_values_supported?: string[];
}

export interface CoreSession {
  personId?: number;
  roles?: string[];
  unid?: string;
  level?: number;
  profileId?: string;
  profile?: IdentityProfile;
  auth?: IdentityAuth;
  exp?: number;
  [key: string]: unknown;
}

export interface CoreLoginResult {
  token: string;
  session: CoreSession;
}

export interface CoreClient {
  login(): Promise<CoreLoginResult>;
  me(): Promise<CoreSession>;
  changeRole(roleId: string): Promise<CoreLoginResult>;
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

export interface Engine9Id {
  getUnid(): Promise<string>;
  getIdentity(): Identity | null;
  requestIdentity(opts: RequestIdentityOptions): Promise<Identity | void>;
  handleCallback(): Promise<Identity | null>;
  ensureLevel(n: number, opts?: EnsureLevelOptions): Promise<Identity | void>;
  logout(opts?: { delegate?: boolean }): void;
  onChange(cb: (identity: Identity | null) => void): () => void;
  readonly level: number;
  readonly isAnonymous: boolean;
  readonly core?: CoreClient;
}
