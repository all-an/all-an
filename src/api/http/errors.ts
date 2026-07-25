import type { NextFunction, Request, Response } from 'express';

/**
 * An error the API meant to produce, carrying the status it should become.
 *
 * Anything thrown that is *not* one of these is a bug, and the handler below treats it as such:
 * 500, logged in full, with nothing from the exception sent to the client. Stack traces and
 * driver messages ("duplicate key value violates unique constraint idx_users_username_lower")
 * describe the schema to whoever asked.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Extra fields merged into the JSON body, for responses that carry more than a message. */
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequest extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, message, details);
  }
}

export class Unauthorized extends ApiError {
  constructor(message = 'Sign in to do that.') {
    super(401, message);
  }
}

export class Forbidden extends ApiError {
  constructor(message = 'That is not yours to change.') {
    super(403, message);
  }
}

export class NotFound extends ApiError {
  constructor(message = 'Not found.') {
    super(404, message);
  }
}

export class Conflict extends ApiError {
  constructor(message: string) {
    super(409, message);
  }
}

export class TooManyRequests extends ApiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(429, message, details);
  }
}

/**
 * Turns thrown errors into responses. Mounted last, after every route.
 *
 * This is the Express equivalent of the @ExceptionHandler methods the Spring controllers used:
 * routes throw a NotFound or a TooManyRequests and stay free of status plumbing.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  // Express cannot add headers to a response already on the wire; handing back to the default
  // handler lets it destroy the connection rather than emit a corrupt body.
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ApiError) {
    res.status(error.status).json({ message: error.message, ...error.details });
    return;
  }

  console.error('Unhandled API error', error);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
}
