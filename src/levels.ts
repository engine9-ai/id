/** Identity Level names (0–7). Levels are confidence, not authorization. */
export const LEVELS = {
  0: 'Inferred',
  1: 'Provided',
  2: 'Contact Confirmed',
  3: 'Trusted Provider Confirmed',
  4: 'Trusted Provider Strongly Confirmed',
  5: 'Identity Checked',
  6: 'Identity Verified',
  7: 'High-Assurance Identity',
} as const;

export type IdentityLevel = keyof typeof LEVELS;

const MEANINGS: Record<IdentityLevel, string> = {
  0: 'We inferred information about this visitor, but the visitor has not confirmed it.',
  1: 'The visitor supplied identity or contact information, but it has not been confirmed.',
  2: 'The visitor demonstrated control of a contact method.',
  3: 'A trusted identity provider authenticated the visitor and confirmed a stable digital identity.',
  4: 'A trusted identity provider authenticated the visitor using a strong authentication method.',
  5: 'The claimed real-world identity has been checked against trusted evidence or records.',
  6: 'Strong evidence establishes that the visitor is the real-world person they claim to be.',
  7: 'The person\'s real-world identity was established with a highest-assurance proofing process.',
};

const PROFILE_FIELDS = [
  'display_name',
  'given_name',
  'family_name',
  'email',
  'phone',
  'attributes',
] as const;

export interface LevelDescription {
  level: number;
  name: string;
  meaning: string;
  category: 'digital' | 'real-world' | 'unknown';
}

export function describeLevel(level: number): LevelDescription {
  if (!Number.isInteger(level) || level < 0 || level > 7) {
    return {
      level,
      name: 'Unknown',
      meaning: 'Not a defined engine9 Identity Level.',
      category: 'unknown',
    };
  }
  const n = level as IdentityLevel;
  return {
    level,
    name: LEVELS[n],
    meaning: MEANINGS[n],
    category: level <= 4 ? 'digital' : 'real-world',
  };
}

export function meetsLevel(
  identity: { level?: number } | null | undefined,
  minLevel: number,
): boolean {
  if (!identity || typeof identity.level !== 'number') return false;
  return identity.level >= minLevel;
}

/**
 * A soft content gate. All set conditions must hold:
 * `minLevel` (identity.level >= n), `maxLevel` (identity.level <= n),
 * `twoFactor` (identity.auth.two_factor). No identity counts as Level 0.
 * Gates hide and show page content. They are not authorization.
 */
export interface ContentGate {
  minLevel?: number;
  maxLevel?: number;
  twoFactor?: boolean;
}

export function meetsGate(
  gate: ContentGate | null | undefined,
  identity: { level?: number; auth?: { two_factor?: boolean } } | null | undefined,
): boolean {
  if (!gate) return true;
  const level = typeof identity?.level === 'number' ? identity.level : 0;
  if (typeof gate.minLevel === 'number' && level < gate.minLevel) return false;
  if (typeof gate.maxLevel === 'number' && level > gate.maxLevel) return false;
  if (gate.twoFactor === true && identity?.auth?.two_factor !== true) return false;
  return true;
}

/** Profile field names a Grant at this level may include. */
export function fieldsForLevel(level: number): string[] {
  if (level <= 0) return [];
  const fields: string[] = [...PROFILE_FIELDS];
  if (level >= 2) fields.push('email_verified', 'phone_verified');
  if (level >= 5) fields.push('verified_claims');
  return fields;
}
