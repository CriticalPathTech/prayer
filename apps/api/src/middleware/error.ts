import 'pino-http';
import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class EditDeadlinePassedError extends AppError {
  constructor(message = 'Edit deadline has passed') {
    super(403, 'EDIT_DEADLINE_PASSED', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message = 'You\u2019ve made several requests in a short time. Please wait a moment before trying again.',
  ) {
    super(429, 'RATE_LIMITED', message);
  }
}

export class OnboardingRequiredError extends AppError {
  constructor() {
    super(401, 'ONBOARDING_REQUIRED', 'Onboarding required');
  }
}

export class CodeNotFoundError extends AppError {
  constructor() {
    super(404, 'CODE_NOT_FOUND', 'Invite code not found');
  }
}

export class CodeFullError extends AppError {
  constructor() {
    super(409, 'CODE_FULL', 'Invite code has no seats left');
  }
}

export class CodeInactiveError extends AppError {
  constructor() {
    super(409, 'CODE_INACTIVE', 'Invite code is retired');
  }
}

export class AlreadyRedeemedError extends AppError {
  constructor() {
    super(409, 'ALREADY_REDEEMED', 'You have already redeemed an invite');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'File is too large.') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}

export class StorageError extends AppError {
  constructor(message = 'Storage upload failed.') {
    super(500, 'STORAGE_ERROR', message);
  }
}

export class TooManySuperUsersError extends AppError {
  constructor() {
    super(409, 'TOO_MANY_SUPER_USERS', 'this church already has 3 super_users; demote one first');
  }
}

export class LastSuperUserError extends AppError {
  constructor() {
    super(
      409,
      'LAST_SUPER_USER',
      'cannot demote the last super_user; promote another member first',
    );
  }
}

export const errorHandler: ErrorRequestHandler = (
  err,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
};
