import type { FetchImpl } from './types';

/** Canonical `@engine9/interfaces/person_email.email_type` values. */
export const EMAIL_TYPES = ['Personal', 'Work', 'Other'] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

/** Canonical `@engine9/interfaces/person_phone.phone_type` values. */
export const PHONE_TYPES = [
  'Personal',
  'Cell',
  'Home',
  'Work',
  'Fax',
  'Other',
] as const;
export type PhoneType = (typeof PHONE_TYPES)[number];

/**
 * Form / inbound people fields aligned with interfaces + core POST /people.
 * Profile token fields (`display_name`) are optional display-only extras.
 */
export const PERSON_FORM_FIELDS = [
  'given_name',
  'family_name',
  'email',
  'email_type',
  'phone',
  'phone_type',
  'display_name',
] as const;

export type PersonFormField = (typeof PERSON_FORM_FIELDS)[number];

/** Flat person row suitable for `{ people: [payload] }`. */
export interface PersonPayload {
  given_name?: string;
  family_name?: string;
  email?: string;
  email_type?: EmailType;
  phone?: string;
  phone_type?: PhoneType;
  display_name?: string;
  source_code?: string;
  [key: string]: unknown;
}

export interface NormalizePersonOptions {
  /** Default when email is present and email_type omitted. */
  defaultEmailType?: EmailType;
  /** Default when phone is present and phone_type omitted. */
  defaultPhoneType?: PhoneType;
}

function asTrimmedString(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s || undefined;
}

function normalizeEmailType(value: unknown): EmailType | undefined {
  const s = asTrimmedString(value);
  if (!s) return undefined;
  const found = EMAIL_TYPES.find((t) => t.toLowerCase() === s.toLowerCase());
  return found;
}

function normalizePhoneType(value: unknown): PhoneType | undefined {
  const s = asTrimmedString(value);
  if (!s) return undefined;
  const found = PHONE_TYPES.find((t) => t.toLowerCase() === s.toLowerCase());
  return found;
}

/**
 * Normalize arbitrary form / JSON input to snake_case interface field names.
 * Never maps `name` → given/family (callers must send given_name / family_name).
 * Never accepts `type` as email_type.
 */
export function normalizePersonPayload(
  input: Record<string, unknown> | FormData | null | undefined,
  opts: NormalizePersonOptions = {},
): PersonPayload {
  const raw: Record<string, unknown> = {};
  if (typeof FormData !== 'undefined' && input instanceof FormData) {
    input.forEach((value, key) => {
      if (typeof value === 'string') raw[key] = value;
    });
  } else if (input && typeof input === 'object') {
    Object.assign(raw, input);
  }

  const given_name = asTrimmedString(raw.given_name);
  const family_name = asTrimmedString(raw.family_name);
  const email = asTrimmedString(raw.email)?.toLowerCase();
  const phone = asTrimmedString(raw.phone);
  const display_name = asTrimmedString(raw.display_name);
  const source_code = asTrimmedString(raw.source_code);

  const payload: PersonPayload = {};
  if (given_name) payload.given_name = given_name;
  if (family_name) payload.family_name = family_name;
  if (email) {
    payload.email = email;
    payload.email_type =
      normalizeEmailType(raw.email_type) ?? opts.defaultEmailType ?? 'Personal';
  }
  if (phone) {
    payload.phone = phone;
    payload.phone_type =
      normalizePhoneType(raw.phone_type) ?? opts.defaultPhoneType ?? 'Personal';
  }
  if (display_name) payload.display_name = display_name;
  if (source_code) payload.source_code = source_code;
  return payload;
}

/** Profile field names to request from delegate for a Level 1 Grant. */
export function identityFieldsFromPersonPayload(
  payload: PersonPayload,
): string[] {
  const fields: string[] = [];
  for (const key of [
    'given_name',
    'family_name',
    'email',
    'phone',
    'display_name',
  ] as const) {
    if (payload[key]) fields.push(key);
  }
  return fields;
}

export interface CreatePersonFormOptions {
  /** Existing form element, or a CSS selector. Creates a form if omitted. */
  form?: HTMLFormElement | string;
  /** Parent to append a generated form into. */
  mount?: HTMLElement | string;
  /** Which fields to render when generating a form. */
  fields?: PersonFormField[];
  /** POST target for `{ people: [payload] }` JSON. */
  endpoint?: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchImpl;
  onSubmit?: (payload: PersonPayload, event: Event) => void | Promise<void>;
  onSuccess?: (response: Response, payload: PersonPayload) => void | Promise<void>;
  onError?: (error: unknown, payload: PersonPayload) => void | Promise<void>;
  source_code?: string;
}

function resolveEl<T extends Element>(
  target: T | string | undefined,
  root: ParentNode = document,
): T | null {
  if (!target) return null;
  if (typeof target === 'string') return root.querySelector(target) as T | null;
  return target;
}

function defaultFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is required');
  }
  return fetch(input, init);
}

function buildField(
  name: PersonFormField,
  label: string,
  input: HTMLElement,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'e9-person-field';
  const lab = document.createElement('label');
  lab.htmlFor = `e9-${name}`;
  lab.textContent = label;
  input.id = `e9-${name}`;
  if ('name' in input) (input as HTMLInputElement).name = name;
  wrap.append(lab, input);
  return wrap;
}

function createInput(
  name: PersonFormField,
  type: string,
  attrs: Record<string, string> = {},
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  return input;
}

function createSelect(
  name: PersonFormField,
  options: readonly string[],
): HTMLSelectElement {
  const select = document.createElement('select');
  select.name = name;
  for (const value of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    select.append(opt);
  }
  return select;
}

/**
 * Bind or generate a person form that submits core-compatible payloads.
 * Soft helper only — does not write a database from the browser alone.
 */
export function createPersonForm(options: CreatePersonFormOptions = {}): {
  form: HTMLFormElement;
  getPayload: () => PersonPayload;
  destroy: () => void;
} {
  if (typeof document === 'undefined') {
    throw new Error('createPersonForm requires a DOM');
  }

  let form = resolveEl<HTMLFormElement>(options.form);
  let generated = false;

  if (!form) {
    generated = true;
    form = document.createElement('form');
    form.className = 'e9-person-form';
    const fields = options.fields ?? [
      'given_name',
      'family_name',
      'email',
      'email_type',
    ];
    for (const field of fields) {
      if (field === 'given_name') {
        form.append(
          buildField(
            field,
            'Given name',
            createInput(field, 'text', {
              autocomplete: 'given-name',
              required: 'true',
            }),
          ),
        );
      } else if (field === 'family_name') {
        form.append(
          buildField(
            field,
            'Family name',
            createInput(field, 'text', { autocomplete: 'family-name' }),
          ),
        );
      } else if (field === 'email') {
        form.append(
          buildField(
            field,
            'Email',
            createInput(field, 'email', {
              autocomplete: 'email',
              required: 'true',
            }),
          ),
        );
      } else if (field === 'email_type') {
        form.append(buildField(field, 'Email type', createSelect(field, EMAIL_TYPES)));
      } else if (field === 'phone') {
        form.append(
          buildField(
            field,
            'Phone',
            createInput(field, 'tel', { autocomplete: 'tel' }),
          ),
        );
      } else if (field === 'phone_type') {
        form.append(buildField(field, 'Phone type', createSelect(field, PHONE_TYPES)));
      } else if (field === 'display_name') {
        form.append(
          buildField(
            field,
            'Display name',
            createInput(field, 'text', { autocomplete: 'nickname' }),
          ),
        );
      }
    }
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Continue';
    form.append(button);

    const mount = resolveEl<HTMLElement>(options.mount) ?? document.body;
    mount.append(form);
  }

  const getPayload = (): PersonPayload => {
    const payload = normalizePersonPayload(new FormData(form!));
    if (options.source_code && !payload.source_code) {
      payload.source_code = options.source_code;
    }
    return payload;
  };

  const onSubmit = async (event: Event): Promise<void> => {
    event.preventDefault();
    const payload = getPayload();
    try {
      if (options.onSubmit) {
        await options.onSubmit(payload, event);
        return;
      }
      if (!options.endpoint) {
        throw new Error('createPersonForm requires endpoint or onSubmit');
      }
      const fetchImpl = options.fetchImpl ?? defaultFetch;
      const response = await fetchImpl(options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers ?? {}),
        },
        body: JSON.stringify({ people: [payload] }),
      });
      if (!response.ok) {
        throw new Error(`Person form submit failed (${response.status})`);
      }
      await options.onSuccess?.(response, payload);
    } catch (err) {
      await options.onError?.(err, payload);
      if (!options.onError) throw err;
    }
  };

  form.addEventListener('submit', onSubmit);

  return {
    form,
    getPayload,
    destroy: () => {
      form!.removeEventListener('submit', onSubmit);
      if (generated) form!.remove();
    },
  };
}
