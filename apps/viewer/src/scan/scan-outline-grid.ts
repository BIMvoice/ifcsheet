/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The points of a thin slab of a scan, already flat in drawing space, as
 * linework (#181): they are counted into an occupancy grid, stray cells are
 * dropped and one-cell gaps closed, and the edge of what is occupied is traced
 * by marching squares into closed outlines, simplified to within a fraction of
 * a cell. A wall scanned on one face comes out as a thin closed band, a wall
 * scanned on both faces as its two faces: a dense outline of what the scanner
 * saw, not a model of it.
 *
 * Pure and synchronous over one slab; the caller decides how often to yield.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';

export interface OutlineOptions {
  /** Cell size, drawing metres. */
  cell: number;
  /** Points a cell needs to count as occupied. */
  minCount?: number;
  /** Coarsen the cell (doubling, up to this factor) while most occupied cells stand alone: a slab too sparse for the cell asked. */
  maxCoarsen?: number;
}

export interface SlabOutline {
  /** Closed outlines in drawing metres, without a closing duplicate point. */
  rings: Point2D[][];
  /** The cell size actually used, metres. */
  cell: number;
  /** Occupied cells after the clean-up. */
  occupied: number;
  /** Most occupied cells stood alone at the cell used: the slab is too sparse for it. */
  sparse: boolean;
}

/** The most cells one grid may have; a larger slab is traced at a coarser cell. */
export const MAX_GRID_CELLS = 16_000_000;
/** Above this share of lone occupied cells the slab is too sparse for the cell: coarsen. */
const SPARSE_SHARE = 0.4;

interface Grid { w: number; h: number; minX: number; minY: number; cell: number; occ: Uint8Array }

function extentOf(xy: Float32Array, n: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2], y = xy[i * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return minX <= maxX ? { minX, minY, maxX, maxY } : null;
}

/** Count the points into cells; an empty border two cells wide (room for the closing to grow into) keeps every outline closed. */
function rasterise(xy: Float32Array, n: number, cell: number, minCount: number, ext: { minX: number; minY: number; maxX: number; maxY: number }): Grid {
  const w = Math.floor((ext.maxX - ext.minX) / cell) + 5;
  const h = Math.floor((ext.maxY - ext.minY) / cell) + 5;
  const minX = ext.minX - 2 * cell, minY = ext.minY - 2 * cell;
  const counts = new Uint16Array(w * h);
  for (let i = 0; i < n; i++) {
    const x = xy[i * 2], y = xy[i * 2 + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const k = Math.floor((y - minY) / cell) * w + Math.floor((x - minX) / cell);
    if (counts[k] < 65535) counts[k]++;
  }
  const occ = new Uint8Array(w * h);
  for (let k = 0; k < occ.length; k++) occ[k] = counts[k] >= minCount ? 1 : 0;
  return { w, h, minX, minY, cell, occ };
}

function neighbours(occ: Uint8Array, w: number, k: number): number {
  return occ[k - w - 1] + occ[k - w] + occ[k - w + 1] + occ[k - 1] + occ[k + 1] + occ[k + w - 1] + occ[k + w] + occ[k + w + 1];
}

/** Occupied cells, and how many of them stand alone (no occupied neighbour): a measure of how sparse the slab is for the cell. */
function loneShare(g: Grid): { lone: number; occupied: number } {
  const { w, h, occ } = g;
  let lone = 0, occupied = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (!occ[k]) continue;
      occupied++;
      if (neighbours(occ, w, k) === 0) lone++;
    }
  }
  return { lone, occupied };
}

/** Drop the cells still alone after closing (stray points, a person walking through); returns how many are left. */
function dropLone(g: Grid): number {
  const { w, h, occ } = g;
  const lone: number[] = [];
  let left = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (!occ[k]) continue;
      if (neighbours(occ, w, k) === 0) lone.push(k);
      else left++;
    }
  }
  for (const k of lone) occ[k] = 0;
  return left;
}

/** Morphological closing, one cell: a gap of one cell in a scanned wall is bridged, the outline does not grow. */
function close(g: Grid): void {
  const { w, h, occ } = g;
  const grown = new Uint8Array(occ.length);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x;
    grown[k] = occ[k] || neighbours(occ, w, k) > 0 ? 1 : 0;
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const k = y * w + x;
    // Erode back: a grown cell stays only when its whole neighbourhood grew (the padded border never grows, so nothing reaches it).
    occ[k] = grown[k] && neighbours(grown, w, k) === 8 ? 1 : occ[k];
  }
}

// Marching squares over cell centres, corners bl=1 br=2 tr=4 tl=8. Edge midpoints in doubled units from the square's
// bottom-left sample: bottom (1,0), right (2,1), top (1,2), left (0,1). Saddles join the occupied diagonal, so a wall
// scanned at an angle stays one band.
type Mid = readonly [number, number];
const B: Mid = [1, 0], R: Mid = [2, 1], T: Mid = [1, 2], L: Mid = [0, 1];
const CASES: readonly (readonly [Mid, Mid])[][] = [
  [], [[L, B]], [[B, R]], [[L, R]], [[R, T]], [[L, T], [B, R]], [[B, T]], [[L, T]],
  [[T, L]], [[B, T]], [[L, B], [R, T]], [[R, T]], [[L, R]], [[B, R]], [[L, B]], [],
];

/** Trace the occupied cells' edges into closed rings, doubled-unit integer coordinates. */
function trace(g: Grid): number[][] {
  const { w, h, occ } = g;
  const W = 2 * w + 1;
  const key = (x: number, y: number) => y * W + x;
  const ends = new Map<number, number[]>();
  const segs: [number, number][] = [];
  const link = (a: number, s: number) => { const l = ends.get(a); if (l) l.push(s); else ends.set(a, [s]); };
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const k = y * w + x;
      const code = occ[k] | (occ[k + 1] << 1) | (occ[k + w + 1] << 2) | (occ[k + w] << 3);
      for (const [a, b] of CASES[code]) {
        const ka = key(2 * x + a[0], 2 * y + a[1]), kb = key(2 * x + b[0], 2 * y + b[1]);
        link(ka, segs.length);
        link(kb, segs.length);
        segs.push([ka, kb]);
      }
    }
  }
  const used = new Uint8Array(segs.length);
  const rings: number[][] = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    used[s0] = 1;
    const ring = [segs[s0][0]];
    let at = segs[s0][1];
    while (at !== ring[0]) {
      ring.push(at);
      const next = (ends.get(at) ?? []).find((s) => !used[s]);
      if (next === undefined) break;
      used[next] = 1;
      at = segs[next][0] === at ? segs[next][1] : segs[next][0];
    }
    if (ring.length >= 3) rings.push(ring);
  }
  return rings.map((r) => r.flatMap((k) => [k % W, Math.floor(k / W)]));
}

/** Ramer–Douglas–Peucker over `pts[from..to]` (flat x,y), keeping the indices kept. */
function rdp(pts: number[], from: number, to: number, eps: number, keep: Uint8Array): void {
  const stack: [number, number][] = [[from, to]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b <= a + 1) continue;
    const ax = pts[a * 2], ay = pts[a * 2 + 1], dx = pts[b * 2] - ax, dy = pts[b * 2 + 1] - ay;
    const len = Math.hypot(dx, dy) || 1;
    let far = -1, best = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i * 2] - ax) * dy - (pts[i * 2 + 1] - ay) * dx) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far < 0) continue;
    keep[far] = 1;
    stack.push([a, far], [far, b]);
  }
}

/** A closed ring simplified: split at the point farthest from its first, each half simplified. */
function simplifyRing(flat: number[], eps: number): number[] {
  const n = flat.length / 2;
  const pts = [...flat, flat[0], flat[1]];
  let far = 0, best = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(flat[i * 2] - flat[0], flat[i * 2 + 1] - flat[1]);
    if (d > best) { best = d; far = i; }
  }
  const keep = new Uint8Array(n + 1);
  keep[0] = keep[far] = keep[n] = 1;
  rdp(pts, 0, far, eps, keep);
  rdp(pts, far, n, eps, keep);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

/**
 * Trace the outline of `n` points (`xy` flat `[x0, y0, …]`, drawing metres).
 * Empty input gives no rings. Deterministic: the same points give the same rings.
 */
export function traceSlabOutline(xy: Float32Array, n: number, options: OutlineOptions): SlabOutline {
  const ext = extentOf(xy, n);
  if (!ext || !(options.cell > 0)) return { rings: [], cell: options.cell, occupied: 0, sparse: false };
  const minCount = Math.max(1, options.minCount ?? 1);
  const span = Math.max(ext.maxX - ext.minX, 1e-9) * Math.max(ext.maxY - ext.minY, 1e-9);
  let cell = Math.max(options.cell, Math.sqrt(span / MAX_GRID_CELLS));
  const limit = options.cell * Math.max(1, options.maxCoarsen ?? 4);
  let grid = rasterise(xy, n, cell, minCount, ext);
  let { lone, occupied } = loneShare(grid);
  while (occupied > 0 && lone / occupied > SPARSE_SHARE && cell * 2 <= limit) {
    cell *= 2;
    grid = rasterise(xy, n, cell, minCount, ext);
    ({ lone, occupied } = loneShare(grid));
  }
  const sparse = occupied > 0 && lone / occupied > SPARSE_SHARE;
  // Bridge one-cell gaps first, so a sparsely scanned wall is one band, then drop what is still alone.
  close(grid);
  const kept = dropLone(grid);
  const eps = 0.7; // doubled units: 0.35 of a cell
  const rings = trace(grid).map((r) => simplifyRing(r, eps)).filter((r) => r.length >= 6).map((r) => {
    const ring: Point2D[] = [];
    for (let i = 0; i < r.length; i += 2) ring.push({ x: grid.minX + (r[i] / 2 + 0.5) * cell, y: grid.minY + (r[i + 1] / 2 + 0.5) * cell });
    return ring;
  });
  return { rings, cell, occupied: kept, sparse };
}
