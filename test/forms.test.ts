import { describe, expect, it } from 'vitest';

import {
  EMAIL_TYPES,
  identityFieldsFromPersonPayload,
  normalizePersonPayload,
  PERSON_FORM_FIELDS,
  PHONE_TYPES,
} from '../src/forms';

describe('PERSON_FORM_FIELDS', () => {
  it('uses interface snake_case names including email_type', () => {
    expect(PERSON_FORM_FIELDS).toContain('given_name');
    expect(PERSON_FORM_FIELDS).toContain('family_name');
    expect(PERSON_FORM_FIELDS).toContain('email');
    expect(PERSON_FORM_FIELDS).toContain('email_type');
    expect(PERSON_FORM_FIELDS).toContain('phone_type');
    expect(EMAIL_TYPES).toEqual(['Personal', 'Work', 'Other']);
    expect(PHONE_TYPES).toContain('Cell');
  });
});

describe('normalizePersonPayload', () => {
  it('normalizes given_name, family_name, email, and defaults email_type', () => {
    const payload = normalizePersonPayload({
      given_name: ' Alex ',
      family_name: 'Rivera',
      email: 'Alex@Example.com',
    });
    expect(payload).toEqual({
      given_name: 'Alex',
      family_name: 'Rivera',
      email: 'alex@example.com',
      email_type: 'Personal',
    });
  });

  it('accepts email_type enum case-insensitively', () => {
    expect(
      normalizePersonPayload({
        email: 'a@b.com',
        email_type: 'work',
      }).email_type,
    ).toBe('Work');
  });

  it('defaults phone_type when phone is present', () => {
    expect(
      normalizePersonPayload({
        phone: '+1 555 0100',
      }),
    ).toEqual({
      phone: '+1 555 0100',
      phone_type: 'Personal',
    });
  });

  it('does not invent given_name from a name field', () => {
    expect(normalizePersonPayload({ name: 'Alex Rivera', email: 'a@b.com' })).toEqual({
      email: 'a@b.com',
      email_type: 'Personal',
    });
  });

  it('ignores type as a stand-in for email_type', () => {
    expect(
      normalizePersonPayload({
        email: 'a@b.com',
        type: 'Work',
      }).email_type,
    ).toBe('Personal');
  });
});

describe('identityFieldsFromPersonPayload', () => {
  it('lists profile grant fields only', () => {
    expect(
      identityFieldsFromPersonPayload({
        given_name: 'Alex',
        email: 'a@b.com',
        email_type: 'Work',
      }),
    ).toEqual(['given_name', 'email']);
  });
});
