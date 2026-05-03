import { sql } from 'kysely';

import type { EventHandler } from './event-worker.js';

interface PrayerPayload {
  post_id: string;
}

export const prayerCountRecomputer: EventHandler = async (event, trx) => {
  const payload = event.payload as PrayerPayload;
  await sql`
    UPDATE posts SET prayer_count = (
      SELECT COUNT(*) FROM prayers WHERE post_id = ${payload.post_id}
    )
    WHERE id = ${payload.post_id}
  `.execute(trx);
};
