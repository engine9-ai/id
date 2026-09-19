import { createEngine9Id } from './client';
import {
  LEVELS,
  describeLevel,
  fieldsForLevel,
  meetsLevel,
} from './levels';
import { verifyIdentityToken } from './verify';

const engine9Id = {
  createEngine9Id,
  LEVELS,
  describeLevel,
  meetsLevel,
  fieldsForLevel,
  verifyIdentityToken,
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
