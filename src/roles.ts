import type { Identity } from './types';

/**
 * Credential constraints shared with `@engine9/core` RoleDefinition.
 * Enforced hard in core; soft (UI only) for declared roles in `@engine9/id`.
 */
export interface RequiredAuth {
  twoFactor?: boolean;
  /** Minimum Identity Level (0–7). */
  minLevel?: number;
}

/**
 * Page-local role for soft personalization. No `person_id` / segment required.
 * When graduating to core, set `segment_id` and enforce via person_segment.
 */
export interface DeclaredRole {
  /** Stable string id (e.g. `activist`). Not a segment UUID unless you choose one. */
  id: string;
  name: string;
  requiredAuth?: RequiredAuth;
  /** Optional Profile.attributes match (all keys must equal). */
  match?: { attributes?: Record<string, unknown> };
  /** Optional map to a core segment role when the Site adds warehouse membership. */
  segment_id?: string;
  /** Core-only when graduating; ignored for soft evaluation. */
  scopes?: string[];
}

export interface DeclaredRoleContext {
  identity: Identity | null | undefined;
  /** Role ids the visitor has claimed on this page (self-select / localStorage). */
  claimedIds?: Iterable<string>;
}

export interface DeclaredRoleEvaluation {
  role: DeclaredRole;
  /** Claimed or attribute-matched. */
  matches: boolean;
  /** Identity satisfies requiredAuth. */
  meetsAuth: boolean;
  /** Soft visibility: matches && meetsAuth. Never authorize privileged actions from this. */
  visible: boolean;
}

/**
 * Check Identity Token confidence against requiredAuth (same rules as core policy).
 */
export function meetsRequiredAuth(
  requiredAuth: RequiredAuth | null | undefined,
  identity: Identity | null | undefined,
): boolean {
  if (!requiredAuth || typeof requiredAuth !== 'object') return true;
  if (requiredAuth.twoFactor === true && !identity?.auth?.two_factor) return false;
  if (typeof requiredAuth.minLevel === 'number') {
    const level = Number(identity?.level);
    if (!Number.isFinite(level) || level < requiredAuth.minLevel) return false;
  }
  return true;
}

function attributesMatch(
  expected: Record<string, unknown> | undefined,
  actual: Record<string, unknown> | undefined,
): boolean {
  if (!expected || typeof expected !== 'object') return true;
  if (!actual || typeof actual !== 'object') return false;
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) return false;
  }
  return true;
}

function isClaimed(roleId: string, claimedIds: Iterable<string> | undefined): boolean {
  if (!claimedIds) return false;
  for (const id of claimedIds) {
    if (id === roleId) return true;
  }
  return false;
}

/**
 * Soft evaluation: claimed/matched + requiredAuth. Not a hard gate.
 */
export function evaluateDeclaredRole(
  role: DeclaredRole,
  ctx: DeclaredRoleContext,
): DeclaredRoleEvaluation {
  const claimed = isClaimed(role.id, ctx.claimedIds);
  const attrOk = attributesMatch(
    role.match?.attributes,
    ctx.identity?.profile?.attributes,
  );
  const hasMatchRule = Boolean(
    role.match?.attributes && Object.keys(role.match.attributes).length > 0,
  );
  const matches = claimed || (hasMatchRule && attrOk);
  const meetsAuth = meetsRequiredAuth(role.requiredAuth, ctx.identity);
  return {
    role,
    matches,
    meetsAuth,
    visible: matches && meetsAuth,
  };
}

export type DeclaredRoleRegistry = Record<string, DeclaredRole>;

export function createRoleRegistry(
  roles: DeclaredRole[] | DeclaredRoleRegistry,
): DeclaredRoleRegistry {
  if (Array.isArray(roles)) {
    const out: DeclaredRoleRegistry = {};
    for (const role of roles) {
      out[role.id] = role;
    }
    return out;
  }
  return { ...roles };
}

/**
 * Map registry → soft visibility by role id.
 */
export function visibleContent(
  registry: DeclaredRoleRegistry,
  ctx: DeclaredRoleContext,
): Record<string, DeclaredRoleEvaluation> {
  const out: Record<string, DeclaredRoleEvaluation> = {};
  for (const [id, role] of Object.entries(registry)) {
    out[id] = evaluateDeclaredRole(role.id ? role : { ...role, id }, ctx);
  }
  return out;
}
