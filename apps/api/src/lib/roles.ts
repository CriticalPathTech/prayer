import type { UserRole } from '@prayer/db';

export function isPrivilegedRole(role: UserRole): boolean {
  return role === 'moderator' || role === 'super_user';
}
