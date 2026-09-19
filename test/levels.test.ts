import { describe, expect, it } from 'vitest';

import {
  describeLevel,
  fieldsForLevel,
  LEVELS,
  meetsLevel,
} from '../src/levels';

describe('LEVELS', () => {
  it('names levels 0–7', () => {
    expect(LEVELS[0]).toBe('Inferred');
    expect(LEVELS[1]).toBe('Provided');
    expect(LEVELS[2]).toBe('Contact Confirmed');
    expect(LEVELS[3]).toBe('Trusted Provider Confirmed');
    expect(LEVELS[4]).toBe('Trusted Provider Strongly Confirmed');
    expect(LEVELS[5]).toBe('Identity Checked');
    expect(LEVELS[6]).toBe('Identity Verified');
    expect(LEVELS[7]).toBe('High-Assurance Identity');
  });
});

describe('describeLevel', () => {
  it('returns name and meaning', () => {
    const l2 = describeLevel(2);
    expect(l2.name).toBe('Contact Confirmed');
    expect(l2.category).toBe('digital');
    expect(l2.meaning).toMatch(/contact/i);
    expect(describeLevel(6).category).toBe('real-world');
  });
});

describe('meetsLevel', () => {
  it('requires a stored identity at or above the minimum', () => {
    expect(meetsLevel(null, 0)).toBe(false);
    expect(meetsLevel({ level: 0 }, 0)).toBe(true);
    expect(meetsLevel({ level: 2 }, 3)).toBe(false);
    expect(meetsLevel({ level: 4 }, 3)).toBe(true);
  });
});

describe('fieldsForLevel', () => {
  it('returns no profile fields at level 0', () => {
    expect(fieldsForLevel(0)).toEqual([]);
  });

  it('adds contact-verified flags at level 2', () => {
    expect(fieldsForLevel(1)).toContain('email');
    expect(fieldsForLevel(1)).not.toContain('email_verified');
    expect(fieldsForLevel(2)).toEqual(
      expect.arrayContaining(['email', 'email_verified', 'phone_verified']),
    );
  });
});
