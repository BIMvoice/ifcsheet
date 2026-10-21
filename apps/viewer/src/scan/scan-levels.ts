/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The floors of a scan, guessed from how its points stack up (#181). A floor
 * or a ceiling is a horizontal surface, so it shows as a dense band in a
 * histogram of the points' heights; walls spread thinly over every height.
 * The lowest dense band is the ground floor. Going up, a band at least a
 * storey above the last floor starts the next one: a ceiling with the floor
 * above it close over it, the higher of the pair is that floor. A band with
 * no storey of points above it is the roof or the top ceiling, not a floor.
 *
 * A guess, offered as the levels a scan opens with; the user corrects them.
 * Heights are the drawing frame's Y (the viewer is Y-up), metres.
 */

/** A level of a scan, as the user sets it: a name and the height of its floor. */
export interface ScanLevel {
  id: string;
  name: string;
  /** The floor's height in the drawing frame (viewer Y), metres. */
  elevation: number;
}

/** Histogram bin, metres. */
const BIN = 0.05;
/** The least height between two floors. */
const MIN_STOREY = 2.2;
/** How far above a ceiling the floor over it may be (the slab and its finish). */
const SLAB = 0.8;
/** Points must reach this far above a floor for a storey to stand on it. */
const ROOM_ABOVE = 1.8;

export interface LevelGuess {
  /** Floor heights, lowest first; one at least for any non-empty scan. */
  floors: number[];
  /** Whether the floors came from dense bands (false: no band stood out, the lowest points were taken). */
  detected: boolean;
}

/**
 * Floors of the points `xyz` (flat x, y, z; `n` points). `step` reads every `step`-th point only
 * (a sample is plenty for a histogram).
 */
export function guessFloors(xyz: ArrayLike<number>, n: number, step = 1): LevelGuess {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i += step) {
    const y = xyz[i * 3 + 1];
    if (!Number.isFinite(y)) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  if (!(min <= max)) return { floors: [], detected: false };
  const bins = Math.max(1, Math.ceil((max - min) / BIN) + 1);
  const counts = new Float64Array(bins);
  let total = 0;
  for (let i = 0; i < n; i += step) {
    const y = xyz[i * 3 + 1];
    if (!Number.isFinite(y)) continue;
    counts[Math.min(bins - 1, Math.floor((y - min) / BIN))]++;
    total++;
  }
  const filled = [...counts].filter((c) => c > 0).sort((a, b) => a - b);
  const median = filled[Math.floor(filled.length / 2)] ?? 0;
  const dense = (c: number) => c >= Math.max(4 * median, 0.02 * total);
  // Runs of dense bins are bands; a band's height is its count-weighted centre.
  const bands: number[] = [];
  for (let b = 0; b < bins;) {
    if (!dense(counts[b])) { b++; continue; }
    let weight = 0, sum = 0;
    for (; b < bins && dense(counts[b]); b++) {
      weight += counts[b];
      sum += counts[b] * (min + (b + 0.5) * BIN);
    }
    bands.push(sum / weight);
  }
  if (bands.length === 0) return { floors: [lowPercentile(xyz, n, step, min, max)], detected: false };
  const floors = [bands[0]];
  for (let i = 1; i < bands.length; i++) {
    const last = floors[floors.length - 1];
    if (bands[i] - last < MIN_STOREY) continue;
    // The floor over a ceiling: the highest band within a slab of it.
    let j = i;
    while (j + 1 < bands.length && bands[j + 1] - bands[i] <= SLAB) j++;
    if (max - bands[j] >= ROOM_ABOVE) floors.push(bands[j]);
    i = j;
  }
  return { floors, detected: true };
}

/** The height below which 1% of the points lie: the ground of a scan with no dense band, clear of a few stray low points. */
function lowPercentile(xyz: ArrayLike<number>, n: number, step: number, min: number, max: number): number {
  const bins = 1000;
  const counts = new Uint32Array(bins);
  let total = 0;
  const span = max - min || 1;
  for (let i = 0; i < n; i += step) {
    const y = xyz[i * 3 + 1];
    if (!Number.isFinite(y)) continue;
    counts[Math.min(bins - 1, Math.floor(((y - min) / span) * bins))]++;
    total++;
  }
  let seen = 0;
  for (let b = 0; b < bins; b++) {
    seen += counts[b];
    if (seen >= total * 0.01) return min + (b / bins) * span;
  }
  return min;
}
