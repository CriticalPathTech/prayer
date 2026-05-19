import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  errorHandler,
  PendingPostsExistError,
  TooManyRequestsError,
} from '../../src/middleware/error.js';

describe('TooManyRequestsError', () => {
  it('errorHandler returns 429 with RATE_LIMITED code', async () => {
    const app = express();
    app.get('/boom', (_req, _res, next) => next(new TooManyRequestsError()));
    app.use(errorHandler);
    const res = await request(app).get('/boom');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message:
          'You\u2019ve made several requests in a short time. Please wait a moment before trying again.',
      },
    });
  });
});

describe('PendingPostsExistError', () => {
  it('returns 409 with pending_posts_exist code and count detail', async () => {
    const app = express();
    app.get('/boom', () => {
      throw new PendingPostsExistError(3);
    });
    app.use(errorHandler);
    const res = await request(app).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'PENDING_POSTS_EXIST',
        message: expect.stringContaining('3'),
        count: 3,
      },
    });
  });
});
