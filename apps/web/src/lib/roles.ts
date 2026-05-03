export type Role = 'member' | 'moderator' | 'super_user';

export function isPrivilegedRole(role: Role | undefined): boolean {
  return role === 'moderator' || role === 'super_user';
}
