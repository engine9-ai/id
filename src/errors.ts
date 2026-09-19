export class DelegateIdentityError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'DelegateIdentityError';
    this.code = code;
  }
}
