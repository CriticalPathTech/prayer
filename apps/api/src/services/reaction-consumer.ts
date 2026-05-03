import { sql } from 'kysely';

import type { EventHandler } from './event-worker.js';

interface ReactionPayload {
  target_type: 'post' | 'comment';
  target_id: string;
  emoji: string;
}

export const reactionCountRecomputer: EventHandler = async (event, trx) => {
  const payload = event.payload as ReactionPayload;
  if (payload.target_type === 'post') {
    await sql`
      UPDATE posts SET reaction_count = (
        SELECT COUNT(*) FROM reactions
        WHERE target_type = 'post' AND target_id = ${payload.target_id}
      )
      WHERE id = ${payload.target_id}
    `.execute(trx);
  } else {
    await sql`
      UPDATE comments SET reaction_count = (
        SELECT COUNT(*) FROM reactions
        WHERE target_type = 'comment' AND target_id = ${payload.target_id}
      )
      WHERE id = ${payload.target_id}
    `.execute(trx);
  }
};
