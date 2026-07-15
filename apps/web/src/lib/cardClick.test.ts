import type { MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isCardBodyClick } from './cardClick';

type EventOverrides = Partial<{
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: HTMLElement;
}>;

function makeEvent(over: EventOverrides = {}): MouseEvent {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: document.createElement('div'),
    ...over,
  } as unknown as MouseEvent;
}

/** An interactive control nested inside the card body, as it renders in a real card. */
function nestedIn(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const card = document.createElement('article');
  const control = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) control.setAttribute(k, v);
  const label = document.createElement('span');
  control.appendChild(label);
  card.appendChild(control);
  return label;
}

afterEach(() => vi.restoreAllMocks());

describe('isCardBodyClick', () => {
  it('is true for a plain left-click on the card body', () => {
    expect(isCardBodyClick(makeEvent())).toBe(true);
  });

  it('is false when another handler already consumed the event', () => {
    expect(isCardBodyClick(makeEvent({ defaultPrevented: true }))).toBe(false);
  });

  it.each([
    ['middle-click', 1],
    ['right-click', 2],
  ])('is false for a %s', (_label, button) => {
    expect(isCardBodyClick(makeEvent({ button }))).toBe(false);
  });

  // Modified clicks belong to the browser (open in new tab/window, extend selection).
  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)(
    'is false when %s is held',
    (modifier) => {
      expect(isCardBodyClick(makeEvent({ [modifier]: true }))).toBe(false);
    },
  );

  describe('interactive targets keep their own click', () => {
    it.each([
      ['a', {}],
      ['button', {}],
      ['input', {}],
      ['textarea', {}],
      ['select', {}],
      ['label', {}],
      ['div', { role: 'menu' }],
      ['div', { role: 'menuitem' }],
      ['div', { role: 'radio' }],
      ['div', { role: 'dialog' }],
      ['div', { role: 'alertdialog' }],
    ])('is false for a click inside <%s %s>', (tag, attrs) => {
      expect(isCardBodyClick(makeEvent({ target: nestedIn(tag, attrs) }))).toBe(false);
    });

    it('is false when the target is the control itself, not a descendant', () => {
      expect(isCardBodyClick(makeEvent({ target: document.createElement('button') }))).toBe(false);
    });
  });

  it('is false while the user has text selected (drag-to-select must not navigate)', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'a selected phrase',
    } as unknown as Selection);
    expect(isCardBodyClick(makeEvent())).toBe(false);
  });

  it('is true when a selection exists but is empty (a click clears the selection)', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => '',
    } as unknown as Selection);
    expect(isCardBodyClick(makeEvent())).toBe(true);
  });

  it('is true when getSelection returns null', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue(null);
    expect(isCardBodyClick(makeEvent())).toBe(true);
  });
});
