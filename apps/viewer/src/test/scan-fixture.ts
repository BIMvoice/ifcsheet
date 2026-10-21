/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A synthetic scan for the tests of #181: the surfaces of box rooms sampled
 * on a grid with a little deterministic noise, the way a scanner sees them
 * (walls, floor and ceiling; no thickness). Viewer frame, Y up.
 */

export interface Room { x0: number; x1: number; z0: number; z1: number; floor: number; ceiling: number }

/** A small deterministic jitter, so the points are not on an exact lattice. */
function jitter(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 0.01;
}

/** The surfaces of `rooms`, one point every `step` metres, flat x, y, z. */
export function roomPoints(rooms: readonly Room[], step = 0.04): Float32Array {
  const out: number[] = [];
  let k = 0;
  const push = (x: number, y: number, z: number) => { out.push(x + jitter(k++), y + jitter(k++), z + jitter(k++)); };
  for (const r of rooms) {
    for (let y = r.floor; y <= r.ceiling + 1e-9; y += step) {
      for (let x = r.x0; x <= r.x1 + 1e-9; x += step) { push(x, y, r.z0); push(x, y, r.z1); }
      for (let z = r.z0; z <= r.z1 + 1e-9; z += step) { push(r.x0, y, z); push(r.x1, y, z); }
    }
    for (let x = r.x0; x <= r.x1 + 1e-9; x += step) {
      for (let z = r.z0; z <= r.z1 + 1e-9; z += step) { push(x, r.floor, z); push(x, r.ceiling, z); }
    }
  }
  return new Float32Array(out);
}

/** The 10 x 6 m room, 3 m high, on the floor at 0, the tests slice. */
export const ROOM: Room = { x0: 0, x1: 10, z0: 0, z1: 6, floor: 0, ceiling: 3 };

/** Distance from `p` to the nearest wall face of `room` in plan (x, z), or to its section outline in (x, y) when `section`. */
export function distanceToRoom(p: { x: number; y: number }, room: Room, section = false): number {
  const [a0, a1, b0, b1] = section ? [room.x0, room.x1, room.floor, room.ceiling] : [room.x0, room.x1, room.z0, room.z1];
  const inA = p.x >= a0 && p.x <= a1, inB = p.y >= b0 && p.y <= b1;
  const toA = Math.min(Math.abs(p.x - a0), Math.abs(p.x - a1));
  const toB = Math.min(Math.abs(p.y - b0), Math.abs(p.y - b1));
  if (inA && inB) return Math.min(toA, toB);
  if (inA) return toB;
  if (inB) return toA;
  return Math.hypot(toA, toB);
}
