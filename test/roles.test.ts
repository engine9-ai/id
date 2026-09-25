import { describe, expect, it } from 'vitest';

import {
  createRoleRegistry,
  evaluateDeclaredRole,
  meetsRequiredAuth,
  visibleContent,
} from '../src/roles';
import type { Identity } from '../src/types';

function identity(partial: Partial<Identity>): Identity {
  return {
    sub: partial.sub ?? 'site.example:u1',
    domain_profile: partial.domain_profile ?? 'site.example:anonymous',
    level: partial.level ?? 0,
    exp: partial.exp ?? Math.floor(Date.now() / 1000) + 3600,
    profile: partial.profile,
    auth: partial.auth,
  };
}

describe('meetsRequiredAuth', () => {
  it('passes when requiredAuth is empty', () => {
    expect(meetsRequiredAuth(undefined, null)).toBe(true);
    expect(meetsRequiredAuth({}, identity({ level: 0 }))).toBe(true);
  });

  it('enforces minLevel against identity.level', () => {
    expect(meetsRequiredAuth({ minLevel: 1 }, identity({ level: 0 }))).toBe(false);
    expect(meetsRequiredAuth({ minLevel: 1 }, identity({ level: 1 }))).toBe(true);
    expect(meetsRequiredAuth({ minLevel: 1 }, null)).toBe(false);
  });

  it('enforces twoFactor from identity.auth.two_factor', () => {
    expect(
      meetsRequiredAuth({ twoFactor: true }, identity({ level: 3 })),
    ).toBe(false);
    expect(
      meetsRequiredAuth(
        { twoFactor: true },
        identity({ level: 3, auth: { two_factor: true } }),
      ),
    ).toBe(true);
  });
});

describe('evaluateDeclaredRole', () => {
  const activist = {
    id: 'activist',
    name: 'Activist',
    requiredAuth: { minLevel: 1 },
  };

  it('is soft-visible when claimed and level meets requiredAuth', () => {
    const result = evaluateDeclaredRole(activist, {
      identity: identity({ level: 1 }),
      claimedIds: ['activist'],
    });
    expect(result.matches).toBe(true);
    expect(result.meetsAuth).toBe(true);
    expect(result.visible).toBe(true);
  });

  it('is not visible when claimed but level is too low', () => {
    const result = evaluateDeclaredRole(activist, {
      identity: identity({ level: 0 }),
      claimedIds: ['activist'],
    });
    expect(result.matches).toBe(true);
    expect(result.meetsAuth).toBe(false);
    expect(result.visible).toBe(false);
  });

  it('matches via profile attributes without a claim', () => {
    const role = {
      ...activist,
      match: { attributes: { interest: 'activist' } },
    };
    const result = evaluateDeclaredRole(role, {
      identity: identity({
        level: 1,
        profile: {
          id: 'p1',
          attributes: { interest: 'activist' },
        },
      }),
    });
    expect(result.matches).toBe(true);
    expect(result.visible).toBe(true);
  });
});

describe('createRoleRegistry / visibleContent', () => {
  it('indexes by role id and reports visibility', () => {
    const registry = createRoleRegistry([
      { id: 'activist', name: 'Activist', requiredAuth: { minLevel: 1 } },
      { id: 'vip', name: 'VIP', requiredAuth: { minLevel: 1 } },
    ]);
    const map = visibleContent(registry, {
      identity: identity({ level: 1 }),
      claimedIds: ['activist'],
    });
    expect(map.activist.visible).toBe(true);
    expect(map.vip.visible).toBe(false);
  });
});
