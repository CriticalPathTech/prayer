import { emojiSchema, flagReasonSchema } from '@prayer/shared';
import { z } from 'zod';

export const zCreateFlag = z
  .object({
    reason: flagReasonSchema,
    note: z.string().max(280).optional(),
  })
  .refine((v) => v.reason !== 'other' || (v.note !== undefined && v.note.trim().length > 0), {
    message: "note required when reason is 'other'",
  });

export const zToggleReaction = z.object({ emoji: emojiSchema });
