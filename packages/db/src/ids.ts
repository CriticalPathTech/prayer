import { uuidv7 } from 'uuidv7';

export function newId(): string {
  return uuidv7();
}
