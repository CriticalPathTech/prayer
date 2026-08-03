export const EXTEND_DAY_CHOICES = [1, 3, 7, 14, 30] as const;
export type ExtendDurationDays = (typeof EXTEND_DAY_CHOICES)[number];
