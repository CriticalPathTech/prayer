import { randomBytes } from 'node:crypto';

// Excludes 0/O, 1/l/I — common copy-paste confusions when humans transcribe
// passwords from a terminal to a 1Password share or chat.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Cryptographically random password drawn from an unambiguous alphabet.
 * Default length is 20 chars (~118 bits of entropy with a 56-char alphabet). */
export function generatePassword(length = 20): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}
