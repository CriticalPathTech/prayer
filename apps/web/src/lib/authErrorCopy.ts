export type ErrorAction =
  'retry' | 'disable60s' | 'disable300s' | 'linkSignIn' | 'linkContactInviter';

export interface ErrorCopy {
  text: string;
  action?: ErrorAction;
}

const MAP: Record<string, ErrorCopy> = {
  // Supabase signup/resend errors
  weak_password: { text: 'Password needs at least 8 characters.' },
  validation_failed: { text: 'Please check the email format.' },
  over_email_send_rate_limit: {
    text: 'Too many sign-up attempts for this email. Please wait a few minutes.',
    action: 'disable60s',
  },
  over_request_rate_limit: {
    text: 'Too many attempts from this device. Please wait a minute and try again.',
    action: 'disable60s',
  },
  signup_disabled: { text: 'Sign-ups are temporarily closed. Try again later.' },

  // API errors (from redeem + preview)
  CODE_NOT_FOUND: {
    text: 'Your invite code is no longer valid. Contact your inviter.',
    action: 'linkContactInviter',
  },
  CODE_FULL: {
    text: 'Sorry, that code just filled up. Ask your inviter for a new one.',
    action: 'linkContactInviter',
  },
  CODE_INACTIVE: {
    text: 'That code has been retired. Ask a moderator for a new one.',
  },
  ALREADY_REDEEMED: { text: "You're already a member — signing you in." },
  ONBOARDING_REQUIRED: { text: 'Please finish signing up.' },
  VALIDATION_ERROR: { text: 'Please check your input and try again.' },
  RATE_LIMITED: {
    text: "You're typing too fast — please wait a moment.",
    action: 'disable60s',
  },
  invalid_credentials: { text: 'Current password is incorrect.' },
  same_password: { text: 'New password must differ from current.' },
  PAYLOAD_TOO_LARGE: { text: 'Image is larger than 2 MB. Please pick a smaller file.' },
  STORAGE_ERROR: { text: "Couldn't save your photo. Please try again." },
};

export function authErrorCopy(err: unknown): ErrorCopy {
  const code = (err as { code?: string } | null)?.code;
  if (code && MAP[code]) return MAP[code];
  return { text: 'Something went wrong. Please try again.', action: 'retry' };
}
