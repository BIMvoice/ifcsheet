/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan or a section of a scan (#181): the points in a thin slab around the
 * view's cut, put in the drawing space a model's cut is drawn in (the same
 * projection, `projectScanPoint`), traced into outlines
 * (`scan-outline-grid.ts`) and handed over as a `Drawing2D` of cut lines, so
 * a sheet draws, prints and exports it like any other drawing: at its true
 * scale, on the CUT layer of the DXF.
 */

import type { Drawing2D, DrawingLine, Point2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { projectScanPoint, type ScanSectionPlane } from '@/hooks/scanSectionMath';
import { viewPlaneConfig } from '@/project/view-plane-config';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { traceSlabOutline } from './scan-outline-grid';
import { CHUNK_POINTS, yieldToPage, type ScanPoints } from './scan-points';

/** Thickness of the slab a cut takes its points from, metres. */
export const SCAN_SLAB_M = 0.15;
/** The thickest slab a cut widens to when the points in the thinner one are too sparse to trace at its cell. */
export const SCAN_SLAB_MAX_M = 0.6;
/** What the scan's lines are drawn as: not an IFC class, the scan is not a model. */
export const SCAN_LINE_TYPE = 'PointCloud';
/** The cell a drawing at 1:N is traced at: half a millimetre of paper, held between 2 cm and 20 cm. */
export const scanCellFor = (scale = 100): number => Math.min(0.2, Math.max(0.02, scale * 0.0005));

/** Where a plan or section of a scan cuts (the plane its model drawing would be cut on, `viewPlaneConfig`); null for a view a scan does not slice (elevations, 3D, drafting). */
export function scanSliceForView(view: ProjectView, levels: readonly ProjectLevel[]): { config: SectionPlaneConfig; plane: ScanSectionPlane } | null {
  if (view.kind !== 'plan' && view.kind !== 'section') return null;
  const config = viewPlaneConfig(view, levels, null);
  if (!config) return null;
  const c = config.customPlane;
  const v = (p: { x: number; y: number; z: number }): [number, number, number] => [p.x, p.y, p.z];
  const plane: ScanSectionPlane = { axis: config.axis, position: config.position, flipped: config.flipped, ...(c ? { custom: { normal: v(c.normal), distance: c.distance, origin: v(c.origin), tangent: v(c.tangent), bitangent: v(c.bitangent) } } : {}) };
  return { config, plane };
}

/** The points of `points` within half the slab of `plane`, projected into drawing space (flat x, y). */
export async function slabPoints(points: ScanPoints, plane: ScanSectionPlane, slab = SCAN_SLAB_M): Promise<{ xy: Float32Array; count: number }> {
  const { xyz, count } = points;
  const half = slab / 2;
  const a = plane.axis === 'x' ? 0 : plane.axis === 'y' ? 1 : 2;
  const n = plane.custom?.normal;
  const nl = n ? Math.hypot(n[0], n[1], n[2]) : 0;
  const dist = (i: number) => (n
    ? (xyz[i * 3] * n[0] + xyz[i * 3 + 1] * n[1] + xyz[i * 3 + 2] * n[2]) / (nl || Infinity) - plane.custom!.distance / (nl || Infinity)
    : xyz[i * 3 + a] - plane.position);
  const picked: number[] = [];
  for (let start = 0; start < count; start += CHUNK_POINTS) {
    const end = Math.min(count, start + CHUNK_POINTS);
    for (let i = start; i < end; i++) if (Math.abs(dist(i)) <= half) picked.push(i);
    if (end < count) await yieldToPage();
  }
  const xy = new Float32Array(picked.length * 2);
  picked.forEach((i, k) => {
    const p = projectScanPoint({ x: xyz[i * 3], y: xyz[i * 3 + 1], z: xyz[i * 3 + 2] }, plane);
    xy[k * 2] = p.x;
    xy[k * 2 + 1] = p.y;
  });
  return { xy, count: picked.length };
}

/** Outlines as the cut lines of a drawing on `plane`. */
export function outlineDrawing(rings: readonly Point2D[][], config: SectionPlaneConfig, scale: number, timeMs = 0): Drawing2D {
  const lines: DrawingLine[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) {
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length];
      lines.push({ line: { start: p, end: q }, category: 'cut', visibility: 'visible', entityId: 0, ifcType: SCAN_LINE_TYPE, modelIndex: 0, depth: 0 });
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  }
  return {
    config: { plane: config, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale },
    lines,
    cutPolygons: [],
    projectionPolygons: [],
    bounds: lines.length ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
    stats: { cutLineCount: lines.length, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: timeMs },
  };
}

/** The drawing of `view` sliced from `points`; null for a view a scan does not slice. */
export async function scanDrawing(points: ScanPoints, view: ProjectView, levels: readonly ProjectLevel[]): Promise<Drawing2D | null> {
  const slice = scanSliceForView(view, levels);
  if (!slice) return null;
  const started = performance.now();
  const scale = view.scale ?? 100;
  const cell = scanCellFor(scale);
  // A thin slab of a sparse scan (a large hall, the two million points a scan keeps spread over it) is dust at the
  // drawing's cell: the slab doubles, up to SCAN_SLAB_MAX_M, until its points are dense enough at that cell; at the
  // thickest the cell coarsens instead (`traceSlabOutline`).
  let traced = null;
  for (let slab = SCAN_SLAB_M; slab <= SCAN_SLAB_MAX_M + 1e-9; slab *= 2) {
    const { xy, count } = await slabPoints(points, slice.plane, slab);
    traced = traceSlabOutline(xy, count, { cell, minCount: 1, maxCoarsen: slab * 2 <= SCAN_SLAB_MAX_M + 1e-9 ? 1 : 4 });
    if (count === 0 || !traced.sparse) break;
  }
  return outlineDrawing(traced?.rings ?? [], slice.config, scale, performance.now() - started);
}
