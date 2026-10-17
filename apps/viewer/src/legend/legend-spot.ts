/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a new legend goes on a sheet: the free place nearest the bottom-right
 * of the drawing area (where a legend is usually read), so it does not cover a
 * drawing when there is room. Deterministic: the same sheet gives the same
 * place. Paper millimetres.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STEP = 5;
const GAP = 5;

const apart = (a: Rect, b: Rect): boolean => a.x + a.w + GAP <= b.x || b.x + b.w + GAP <= a.x || a.y + a.h + GAP <= b.y || b.y + b.h + GAP <= a.y;

/**
 * The top-left corner for a box of `size` inside `area`, clear of `taken` by a gap. Scans from the
 * bottom-right corner leftwards, then up; when nothing is clear it takes the bottom-right corner.
 */
export function freeSpot(area: Rect, taken: readonly Rect[], size: { width: number; height: number }): { x: number; y: number } {
  const maxX = Math.max(area.x, area.x + area.w - size.width);
  const maxY = Math.max(area.y, area.y + area.h - size.height);
  for (let y = maxY; y >= area.y; y -= STEP) {
    for (let x = maxX; x >= area.x; x -= STEP) {
      const box: Rect = { x, y, w: size.width, h: size.height };
      if (taken.every((t) => apart(box, t))) return { x, y };
    }
  }
  return { x: maxX, y: maxY };
}
