/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #181: a plan and a section of a scan are the outline of the points in a
 * thin slab at the cut. A synthetic scan of a 10 x 6 x 3 m room (its walls,
 * floor and ceiling, no thickness) is sliced and the outline compared with the
 * room: every line within a cell of a wall face, and every wall face drawn.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { ROOM, distanceToRoom, roomPoints, type Room } from '@/test/scan-fixture';
import type { PlanProjectView, ProjectView, SectionProjectView } from '@/project/types';
import { scanCellFor, scanDrawing, SCAN_LINE_TYPE } from './scan-drawing';
import { guessFloors } from './scan-levels';
import { traceSlabOutline } from './scan-outline-grid';
import type { ScanPoints } from './scan-points';

const pointsOf = (rooms: readonly Room[]): ScanPoints => {
  const xyz = roomPoints(rooms);
  return { xyz, count: xyz.length / 3, bounds: null };
};

const plan = (elevation: number, cutHeight: number, scale = 100): PlanProjectView => ({
  id: 'p', kind: 'plan', name: 'Level 0', createdAt: 0, cutHeight, scale, level: { name: 'Level 0', elevation, storeyGlobalIds: ['scan-level:l0'] },
});
const section = (plane: SectionProjectView['plane']): SectionProjectView => ({ id: 's', kind: 'section', name: 'Section A-A', createdAt: 0, plane, scale: 100 });

/**
 * Every vertex of the drawing within `tol` of the room's outline, and every side of the room passed by the drawing.
 * A face scanned with no thickness is traced as a band about a cell wide, its edges within a cell and a half of the face.
 */
function assertTracesRoom(drawing: Drawing2D | null, room: Room, section: boolean, tol: number): void {
  assert.ok(drawing, 'a drawing');
  assert.ok(drawing.lines.length >= 4, `lines: ${drawing.lines.length}`);
  assert.ok(drawing.lines.every((l) => l.category === 'cut' && l.ifcType === SCAN_LINE_TYPE));
  const far = drawing.lines.flatMap((l) => [l.line.start, l.line.end]).filter((p) => distanceToRoom(p, room, section) > tol);
  assert.deepEqual(far.slice(0, 3), [], `${far.length} vertices further than ${tol} m from the room`);
  const [a0, a1, b0, b1] = section ? [room.x0, room.x1, room.floor, room.ceiling] : [room.x0, room.x1, room.z0, room.z1];
  // Each side sampled every 0.5 m: a line of the outline passes within tol of every sample.
  const onSegment = (p: { x: number; y: number }) => drawing.lines.some(({ line: { start: s, end: e } }) => {
    const dx = e.x - s.x, dy = e.y - s.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / len2));
    return Math.hypot(s.x + t * dx - p.x, s.y + t * dy - p.y) <= tol;
  });
  const missed: string[] = [];
  for (let a = a0; a <= a1; a += 0.5) for (const b of [b0, b1]) if (!onSegment({ x: a, y: b })) missed.push(`(${a}, ${b})`);
  for (let b = b0; b <= b1; b += 0.5) for (const a of [a0, a1]) if (!onSegment({ x: a, y: b })) missed.push(`(${a}, ${b})`);
  assert.deepEqual(missed, [], 'every side of the room is drawn');
}

describe('a plan sliced from a scan (#181)', () => {
  it('is the outline of the room at the cut height, within a cell', async () => {
    const drawing = await scanDrawing(pointsOf([ROOM]), plan(0, 1.2), []);
    assertTracesRoom(drawing, ROOM, false, 1.5 * scanCellFor(100));
    assert.equal(drawing!.config.plane.axis, 'y');
    assert.equal(drawing!.config.plane.position, 1.2);
  });

  it('cuts where the level and its cut height put it: above the ceiling there is nothing', async () => {
    const drawing = await scanDrawing(pointsOf([ROOM]), plan(2.5, 1.2), []);
    assert.equal(drawing!.lines.length, 0);
  });

  it('draws a second room on the floor above at that level only', async () => {
    const upper: Room = { x0: 0, x1: 5, z0: 0, z1: 6, floor: 3.3, ceiling: 6.1 };
    const points = pointsOf([ROOM, upper]);
    assertTracesRoom(await scanDrawing(points, plan(3.3, 1.2), []), upper, false, 1.5 * scanCellFor(100));
  });

  it('is traced finer at a larger scale', async () => {
    const coarse = await scanDrawing(pointsOf([ROOM]), plan(0, 1.2, 200), []);
    const fine = await scanDrawing(pointsOf([ROOM]), plan(0, 1.2, 50), []);
    assertTracesRoom(fine, ROOM, false, 1.5 * scanCellFor(50));
    assertTracesRoom(coarse, ROOM, false, 1.5 * scanCellFor(200));
    assert.ok(fine!.lines.length > coarse!.lines.length || fine!.lines.length > 0);
  });
});

describe('a section sliced from a scan (#181)', () => {
  it('is the outline of the room across the cut: walls, floor and ceiling', async () => {
    const drawing = await scanDrawing(pointsOf([ROOM]), section({ axis: 'front', offset: 3, flipped: false }), []);
    assertTracesRoom(drawing, ROOM, true, 1.5 * scanCellFor(100));
    assert.equal(drawing!.config.plane.axis, 'z');
  });

  it('takes the points of the cut only: a section outside the room draws nothing', async () => {
    const drawing = await scanDrawing(pointsOf([ROOM]), section({ axis: 'front', offset: 8, flipped: false }), []);
    assert.equal(drawing!.lines.length, 0);
  });

  it('is not made for an elevation: a scan gives none', async () => {
    const elevation = { id: 'e', kind: 'elevation', name: 'North', createdAt: 0, direction: 'north' } as ProjectView;
    assert.equal(await scanDrawing(pointsOf([ROOM]), elevation, []), null);
  });
});

describe('the outline of a slab', () => {
  it('drops lone points and keeps the wall', () => {
    const xy = new Float32Array([...Array.from({ length: 200 }, (_, i) => [i * 0.02, 0]).flat(), 50, 50]);
    const { rings } = traceSlabOutline(xy, xy.length / 2, { cell: 0.05 });
    const all = rings.flat();
    assert.ok(all.length > 0);
    assert.ok(all.every((p) => p.x < 5 && Math.abs(p.y) < 0.1), 'nothing drawn at the stray point');
  });

  it('coarsens a slab too sparse for its cell instead of drawing dust', () => {
    // A wall seen as one point every 15 cm: at 5 cm cells every cell stands alone.
    const xy = new Float32Array(Array.from({ length: 60 }, (_, i) => [i * 0.15, 0]).flat());
    const out = traceSlabOutline(xy, xy.length / 2, { cell: 0.05, maxCoarsen: 4 });
    assert.ok(out.cell > 0.05, `cell ${out.cell}`);
    assert.equal(out.rings.length, 1, 'one band along the wall');
  });
});

describe('the floors of a scan', () => {
  it('are the dense bands: the ground floor and the floor over the ceiling below it', () => {
    const upper: Room = { x0: 0, x1: 10, z0: 0, z1: 6, floor: 3.3, ceiling: 6.1 };
    const { floors, detected } = guessFloors(roomPoints([ROOM, upper]), roomPoints([ROOM, upper]).length / 3);
    assert.equal(detected, true);
    assert.equal(floors.length, 2, floors.join(', '));
    assert.ok(Math.abs(floors[0] - 0) < 0.06 && Math.abs(floors[1] - 3.3) < 0.06, floors.join(', '));
  });

  it('takes the ceiling of a single room for no floor', () => {
    const { floors } = guessFloors(roomPoints([ROOM]), roomPoints([ROOM]).length / 3);
    assert.equal(floors.length, 1);
    assert.ok(Math.abs(floors[0]) < 0.06);
  });
});
