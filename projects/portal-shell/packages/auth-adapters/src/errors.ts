// ---------------------------------------------------------------------------
// Typed error classes for the auth-adapters package
// ---------------------------------------------------------------------------

export class AuthAdapterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AuthAdapterError';
  }
}

export class TokenValidationError extends AuthAdapterError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TokenValidationError';
  }
}

export class InvalidCredentialsError extends AuthAdapterError {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}

export class UserNotFoundError extends AuthAdapterError {
  constructor(identifier: string) {
    super(`User '${identifier}' not found`);
    this.name = 'UserNotFoundError';
  }
}
