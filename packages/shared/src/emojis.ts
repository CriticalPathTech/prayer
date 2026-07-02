import { z } from 'zod';

export const EMOJI_SET = ['🙏', '❤️', '💪', '😢', '✝️', '🙌'] as const;
export type Emoji = (typeof EMOJI_SET)[number];
export const emojiSchema = z.enum(EMOJI_SET);
