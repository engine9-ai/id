import { createEngine9Id } from './client';
import { mount, bindContent, gateFromElement, CONTENT_ATTRIBUTES } from './content';
import { isSiteKeyRejected, isStateMismatch, SITE_KEY_REJECTED, STATE_MISMATCH } from './errors';
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
  meetsGate,
  meetsLevel,
} from './levels';
import { createDelegateProvider } from './provider';
import {
  meetsRequiredAuth,
  evaluateDeclaredRole,
  createRoleRegistry,
  visibleContent,
} from './roles';
import { skipDowngrades } from './skip';
import { verifyIdentityToken } from './verify';
import { loginWidget } from './widget';

const engine9Id = {
  mount,
  loginWidget,
  bindContent,
  gateFromElement,
  CONTENT_ATTRIBUTES,
  createEngine9Id,
  createDelegateProvider,
  LEVELS,
  describeLevel,
  meetsLevel,
  meetsGate,
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
  isSiteKeyRejected,
  isStateMismatch,
  SITE_KEY_REJECTED,
  STATE_MISMATCH,
  skipDowngrades,
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
