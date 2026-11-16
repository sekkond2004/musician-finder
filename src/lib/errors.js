/**
 * Application error types. Services throw these; the error-handling middleware
 * turns them into JSON responses with the right status code. Anything that is
 * not an AppError is treated as an unexpected 500 and its details are hidden
 * from the user (NFR5: no stack traces in responses).
 */
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  /** @param {Record<string,string>} fieldErrors map of field name -> message */
  constructor(fieldErrors, message = 'Please fix the highlighted fields.') {
    super(400, 'VALIDATION_ERROR', message, fieldErrors);
    this.name = 'ValidationError';
  }
}

class AuthError extends AppError {
  constructor(message = 'Please log in to continue.') {
    super(401, 'UNAUTHENTICATED', message);
    this.name = 'AuthError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(404, 'NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message, details) {
    super(409, 'CONFLICT', message, details);
    this.name = 'ConflictError';
  }
}

class RateLimitError extends AppError {
  constructor(message, retryAfterSeconds) {
    super(429, 'RATE_LIMITED', message, { retryAfterSeconds });
    this.name = 'RateLimitError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  NotFoundError,
  ConflictError,
  RateLimitError,
};
