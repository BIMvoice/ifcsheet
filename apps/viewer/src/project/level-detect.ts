/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Likely floor levels of a model that states none (a glTF/GLB), read from its
 * upward-facing faces: a floor is a large area of triangles facing up at one
 * height. Heights are in the frame the meshes are drawn in (Y up). The lowest
 * point of the model is always a level (the ground); the top of the model is
 * not (a roof is not a floor).
 */

import type { MeshData } from '@ifc-lite/geometry';

/** A face counts as a floor face when its normal is within about 18 degrees of straight up. */
const UP = 0.95;
/** Faces this close in height are one floor. */
const BIN_M = 0.1;
/** A floor has at least this share of the largest floor's area; stairs, tables and ledges are smaller. */
const MIN_SHARE = 0.15;
/** A floor this close to the lowest point is the ground; one this close to the top is the roof. */
const END_M = 0.3;
/** More levels than this is not a building's floors. */
const MAX_LEVELS = 12;

export interface DetectedLevel {
  elevation: number;
}

/** Floor heights of `meshes`, lowest first; empty when there is no geometry. */
export function detectLevels(meshes: readonly MeshData[]): DetectedLevel[] {
  const area = new Map<number, { area: number; weighted: number }>();
  let low = Infinity;
  let high = -Infinity;
  for (const mesh of meshes) {
    const p = mesh.positions;
    for (let i = 1; i < p.length; i += 3) {
      if (p[i] < low) low = p[i];
      if (p[i] > high) high = p[i];
    }
    const idx = mesh.indices;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      // Winding is not reliable (meshes are double-sided): a face is flat, and its height is what matters.
      if (len === 0 || Math.abs(ny) / len < UP) continue;
      const faceArea = len / 2;
      const y = (p[a + 1] + p[b + 1] + p[c + 1]) / 3;
      const bin = Math.round(y / BIN_M);
      const slot = area.get(bin) ?? { area: 0, weighted: 0 };
      slot.area += faceArea;
      slot.weighted += faceArea * y;
      area.set(bin, slot);
    }
  }
  if (!Number.isFinite(low)) return [];

  // Neighbouring bins are one floor.
  const floors: { y: number; area: number }[] = [];
  let run: { area: number; weighted: number; last: number } | null = null;
  for (const bin of [...area.keys()].sort((x, y) => x - y)) {
    const slot = area.get(bin)!;
    if (run && bin - run.last <= 1) {
      run.area += slot.area;
      run.weighted += slot.weighted;
      run.last = bin;
    } else {
      if (run) floors.push({ y: run.weighted / run.area, area: run.area });
      run = { ...slot, last: bin };
    }
  }
  if (run) floors.push({ y: run.weighted / run.area, area: run.area });

  const biggest = Math.max(0, ...floors.map((f) => f.area));
  let kept = floors.filter((f) => f.area >= biggest * MIN_SHARE && !(high - f.y < END_M && f.y - low >= END_M));
  if (kept.length > MAX_LEVELS) kept = [...kept].sort((x, y) => y.area - x.area).slice(0, MAX_LEVELS).sort((x, y) => x.y - y.y);
  const levels = kept.map((f) => f.y);
  // The ground is a level even where no slab marks it.
  if (!levels.some((y) => y - low < END_M)) levels.unshift(low);
  return levels.sort((x, y) => x - y).map((y) => ({ elevation: Math.round(y * 100) / 100 }));
}
