import { createEngine9Id } from './client';
import {
  EMAIL_TYPES,
  PHONE_TYPES,
  PERSON_FORM_FIELDS,
  normalizePersonPayload,
  identityFieldsFromPersonPayload,
  createPersonForm,
} from './forms';
import {
  LEVELS,
  describeLevel,
  fieldsForLevel,
  meetsLevel,
} from './levels';
import { createDelegateProvider } from './provider';
import {
  meetsRequiredAuth,
  evaluateDeclaredRole,
  createRoleRegistry,
  visibleContent,
} from './roles';
import { verifyIdentityToken } from './verify';

const engine9Id = {
  createEngine9Id,
  createDelegateProvider,
  LEVELS,
  describeLevel,
  meetsLevel,
  fieldsForLevel,
  verifyIdentityToken,
  meetsRequiredAuth,
  evaluateDeclaredRole,
  createRoleRegistry,
  visibleContent,
  EMAIL_TYPES,
  PHONE_TYPES,
  PERSON_FORM_FIELDS,
  normalizePersonPayload,
  identityFieldsFromPersonPayload,
  createPersonForm,
};

declare global {
  interface Window {
    engine9Id: typeof engine9Id;
  }
}

if (typeof window !== 'undefined') {
  window.engine9Id = engine9Id;
}

export default engine9Id;
