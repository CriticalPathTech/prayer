import type { UserRole } from '@prayer/db';

declare global {
  namespace Express {
    interface Request {
      supabase?: {
        auth_id: string;
        email: string;
      };
      user?: {
        id: string;
        supabaseAuthId: string;
        email: string;
        displayName: string;
        avatarUrl: string | null;
        role: UserRole;
        orgId: string;
      };
      org?: {
        id: string;
        slug: string;
        displayName: string;
        requiresPostApproval: boolean;
      };
    }
  }
}

export {};
