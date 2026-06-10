import { z } from 'zod';

export const FLAG_REASONS = ['inappropriate', 'off_topic', 'hateful', 'other'] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];
// zod v4 + TS 5.9 mis-infer `z.enum()` over a `readonly` tuple — see emojis.ts.
export const flagReasonSchema = z.enum(FLAG_REASONS as unknown as [FlagReason, ...FlagReason[]]);
