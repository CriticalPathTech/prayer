import { z } from 'zod';

export const EMOJI_SET = ['🙏', '❤️', '💪', '😢', '✝️', '🙌'] as const;
export type Emoji = (typeof EMOJI_SET)[number];
// zod v4 + TS 5.9 mis-infer `z.enum()` over a `readonly` tuple (the inferred
// member type collapses to `tuple[keyof tuple]`, pulling in `.length`/methods).
// The assertion to a mutable literal tuple restores the correct enum members;
// runtime behavior is identical. See docs/post-extension-implementation.md (Issue 1).
export const emojiSchema = z.enum(EMOJI_SET as unknown as [Emoji, ...Emoji[]]);
