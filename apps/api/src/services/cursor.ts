import { ValidationError } from '../middleware/error.js';

export type FeedFilter = 'all' | 'mine' | 'answered';

export interface CursorPayload {
  filter: FeedFilter;
  id: string;
}

export interface DecodedCursor {
  id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badCursor(reason: string): never {
  throw new ValidationError(`Invalid cursor: ${reason}`);
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(token: string, filter: FeedFilter): DecodedCursor {
  let raw: unknown;
  try {
    const json = Buffer.from(token, 'base64url').toString('utf8');
    raw = JSON.parse(json);
  } catch {
    badCursor('malformed');
  }
  if (typeof raw !== 'object' || raw === null) badCursor('not an object');
  const obj = raw as Record<string, unknown>;
  if (obj['filter'] !== filter) badCursor('filter mismatch');
  if (typeof obj['id'] !== 'string' || !UUID_RE.test(obj['id'])) badCursor('bad id');
  const keys = Object.keys(obj).sort();
  if (keys.length !== 2 || keys[0] !== 'filter' || keys[1] !== 'id') {
    badCursor('unexpected fields');
  }
  return { id: obj['id'] };
}
