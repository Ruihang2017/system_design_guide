// Leitner-box spaced-repetition scheduler.
//
// Pure, dependency-free logic so it is trivially testable and reusable by any
// client component. A card lives in a "box" 0..4; correct recall promotes it to
// a higher box (reviewed less often), an incorrect recall sends it back to box 0.
// The UI persists a map of cardId -> CardState in localStorage; this module only
// computes the next state and whether a card is currently due.

export const NUM_BOXES = 5; // boxes 0..4

const DAY = 24 * 60 * 60 * 1000;

// Review interval per box, in milliseconds. Box 0 is due immediately; each
// higher box pushes the next review further out.
const INTERVALS_MS: readonly number[] = [0, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY];

export interface CardState {
  /** Current Leitner box, 0..NUM_BOXES-1. */
  box: number;
  /** Epoch milliseconds at which the card is next due for review. */
  due: number;
}

/** Clamp a box index into the valid 0..NUM_BOXES-1 range. */
function clampBox(box: number): number {
  if (Number.isNaN(box)) return 0;
  return Math.max(0, Math.min(Math.floor(box), NUM_BOXES - 1));
}

/** The review interval (ms) for a given box. */
export function intervalMs(box: number): number {
  return INTERVALS_MS[clampBox(box)];
}

/** A brand-new card: box 0, due now. */
export function newCard(now: number): CardState {
  return { box: 0, due: now };
}

/** Correct recall: promote one box (capped at the top) and schedule further out. */
export function promote(card: CardState, now: number): CardState {
  const box = clampBox(card.box + 1);
  return { box, due: now + intervalMs(box) };
}

/** Incorrect recall: reset to box 0 and make the card due immediately. */
export function demote(_card: CardState, now: number): CardState {
  return { box: 0, due: now };
}

/** Whether the card is due for review at `now`. */
export function isDue(card: CardState, now: number): boolean {
  return card.due <= now;
}
