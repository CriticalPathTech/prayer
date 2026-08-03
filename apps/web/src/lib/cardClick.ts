import type { MouseEvent } from 'react';

// Anything matching this is an interactive control whose own click should win —
// the card must NOT also navigate. Covers links, form controls, the ⋯ menu, and
// the modal/menu overlays that render inside the card (ConfirmDialog →
// role="alertdialog", FlagModal → role="dialog", PostMenu → role="menu").
const INTERACTIVE_SELECTOR =
  'a, button, input, textarea, select, label, [role="menu"], [role="menuitem"], [role="radio"], [role="dialog"], [role="alertdialog"]';

/**
 * True when a click on a card body should open the post — i.e. it landed on the
 * card itself, not on an interactive control, isn't a modified/secondary click,
 * and the user isn't in the middle of selecting text. Navigation happens in the
 * same tab via the caller's `navigate()`.
 */
export function isCardBodyClick(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const target = e.target as HTMLElement | null;
  if (target?.closest(INTERACTIVE_SELECTOR)) return false;
  if (typeof window !== 'undefined' && (window.getSelection()?.toString().length ?? 0) > 0) {
    return false;
  }
  return true;
}
