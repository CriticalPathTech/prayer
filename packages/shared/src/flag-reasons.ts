import { z } from 'zod';

export const FLAG_REASONS = ['inappropriate', 'off_topic', 'hateful', 'other'] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];
export const flagReasonSchema = z.enum(FLAG_REASONS);
