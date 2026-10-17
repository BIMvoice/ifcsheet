/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Where a new legend goes: clear of what is on the sheet, nearest the bottom-right, the same every time. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { freeSpot } from './legend-spot.js';

const area = { x: 10, y: 10, w: 400, h: 280 };
const size = { width: 80, height: 60 };

describe('freeSpot', () => {
  it('takes the bottom-right corner of an empty sheet', () => {
    assert.deepEqual(freeSpot(area, [], size), { x: 330, y: 230 });
  });

  it('keeps clear of a drawing in that corner, by a gap, moving left', () => {
    const at = freeSpot(area, [{ x: 300, y: 200, w: 110, h: 90 }], size);
    assert.ok(at.x + size.width + 5 <= 300 || at.y + size.height + 5 <= 200, `at ${at.x}, ${at.y}`);
    assert.ok(at.x >= area.x && at.y >= area.y);
  });

  it('goes above a drawing that fills the bottom', () => {
    const at = freeSpot(area, [{ x: 10, y: 150, w: 400, h: 140 }], size);
    assert.equal(at.y + size.height + 5 <= 150, true);
  });

  it('is the same on every run', () => {
    const taken = [{ x: 100, y: 100, w: 150, h: 120 }];
    assert.deepEqual(freeSpot(area, taken, size), freeSpot(area, taken, size));
  });

  it('falls back to the corner when nothing is clear, and never leaves the area', () => {
    const at = freeSpot(area, [{ x: 0, y: 0, w: 500, h: 400 }], size);
    assert.deepEqual(at, { x: 330, y: 230 });
    const big = freeSpot(area, [], { width: 900, height: 900 });
    assert.deepEqual(big, { x: 10, y: 10 });
  });
});
