import { newId } from '@prayer/db';

import type { EventHandler } from '../event-worker.js';

interface InviteAcceptedPayload {
  invitation_id: string;
  invitee_id: string;
  invitee_display_name: string;
}

export const inviteAcceptedBuilder: EventHandler = async (event, trx) => {
  const payload = event.payload as InviteAcceptedPayload;
  if (!event.actor_id) return;

  await trx
    .insertInto('notifications')
    .values({
      id: newId(),
      org_id: event.org_id,
      user_id: event.actor_id,
      type: 'invite.accepted',
      payload: {
        invitation_id: payload.invitation_id,
        invitee_id: payload.invitee_id,
        invitee_display_name: payload.invitee_display_name,
      } as never,
    })
    .execute();
};
