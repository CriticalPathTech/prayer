export interface InviteEmailInput {
  /** Church name already passed through `churchName()`; null when the org has no display name. */
  church: string | null;
  code: string;
  signupUrl: string;
  /** Drives the closing line — a multi-seat code is meant to be forwarded. */
  seatsRemaining: number;
}

export interface InviteEmail {
  subject: string;
  body: string;
}

/**
 * Ready-to-send invitation text for an invite code. Pure so the wording can be
 * tested without rendering, and so the component stays presentational.
 */
export function buildInviteEmail({
  church,
  code,
  signupUrl,
  seatsRemaining,
}: InviteEmailInput): InviteEmail {
  const subject = church
    ? `An invitation to the ${church} prayer wall`
    : 'An invitation to our prayer wall';

  const invitation = church
    ? `I'd love for you to join our prayer wall at ${church}.`
    : `I'd love for you to join our prayer wall.`;

  const closing =
    seatsRemaining > 1
      ? 'Please keep this code within our church family.'
      : "The code is just for you, so please don't pass it on.";

  const body = [
    'Hi,',
    '',
    `${invitation} It's a private space where our church family shares what they're praying for and prays for each other — only people with an invite can see it.`,
    '',
    'To join:',
    `1. Go to ${signupUrl}`,
    `2. Enter this invite code: ${code}`,
    '',
    closing,
    '',
    'Hope to see you there.',
  ].join('\n');

  return { subject, body };
}
