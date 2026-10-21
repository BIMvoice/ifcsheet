/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The points a scan's drawings are sliced from (#181), in the drawing frame:
 * the bounded CPU sample each streamed scan keeps (`pointCloudScanCache.ts`,
 * up to two million points a scan) and the points of an inline IFCx point
 * cloud, each put where the 3D view draws it — through the scan's GPU
 * transform when it has one, the same matrix the scan section layer reads
 * (`useScanSectionLayer.ts`). Gathered once into one flat array and kept
 * while the scans stay the same; the copy yields to the page between chunks,
 * so a few million points never hold up a frame for long.
 */

import type { FederatedModel } from '@/store/types';
import { getPointCloudScanSample } from '@/hooks/ingest/pointCloudScanCache';
import { getGlobalRenderer } from '@/hooks/useBCF';
import type { AxisBounds } from '@/lib/section/section-distance';

/** Points copied between yields. */
export const CHUNK_POINTS = 250_000;

export interface ScanPoints {
  /** Flat x, y, z in the drawing frame, `count` points. */
  xyz: Float32Array;
  count: number;
  bounds: AxisBounds | null;
}

interface Source { positions: Float32Array; count: number; matrix?: Float32Array; key: string }

/** Whether the loaded models are scans and nothing else: no meshes, at least one point cloud. */
export function isScanOnly(models: ReadonlyMap<string, FederatedModel>, meshCount: number): boolean {
  if (meshCount > 0 || models.size === 0) return false;
  return [...models.values()].some((m) => typeof m.pointCloudHandleId === 'number' || (m.geometryResult?.pointClouds?.some((p) => p.chunk.pointCount > 0) ?? false));
}

function sourcesOf(models: ReadonlyMap<string, FederatedModel>): Source[] {
  const out: Source[] = [];
  for (const model of models.values()) {
    if (!model.visible) continue;
    if (typeof model.pointCloudHandleId === 'number') {
      const sample = getPointCloudScanSample(model.pointCloudHandleId);
      const matrix = getGlobalRenderer()?.getPointCloudTransform({ id: model.pointCloudHandleId });
      if (sample && sample.count > 0) out.push({ positions: sample.positions, count: sample.count, matrix, key: `${model.pointCloudHandleId}:${sample.seen}:${matrix ? [...matrix].join(',') : ''}` });
    }
    model.geometryResult?.pointClouds?.forEach((asset, i) => {
      if (asset.chunk.pointCount > 0) out.push({ positions: asset.chunk.positions, count: asset.chunk.pointCount, key: `${model.id}:${i}:${asset.chunk.pointCount}` });
    });
  }
  return out;
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export const yieldToPage =() => new Promise<void>((resolve) => setTimeout(resolve, 0));

let cached: { key: string; points: ScanPoints } | null = null;
let pending: { key: string; points: Promise<ScanPoints> } | null = null;

/**
 * The scans' points in the drawing frame, with their bounds. `onProgress`
 * hears 0..1 as they are gathered. The same scans give the same array back
 * without copying again.
 */
export function gatherScanPoints(models: ReadonlyMap<string, FederatedModel>, onProgress?: (done: number) => void): Promise<ScanPoints> {
  const sources = sourcesOf(models);
  const key = sources.map((s) => s.key).join('|');
  if (cached && cached.key === key) return Promise.resolve(cached.points);
  // Every view asks at once when a scan opens: one copy serves them all.
  if (pending && pending.key === key) return pending.points;
  const points = copyPoints(sources, onProgress).then((p) => {
    cached = { key, points: p };
    return p;
  }).finally(() => {
    if (pending?.key === key) pending = null;
  });
  pending = { key, points };
  return points;
}

async function copyPoints(sources: readonly Source[], onProgress?: (done: number) => void): Promise<ScanPoints> {
  const total = sources.reduce((n, s) => n + s.count, 0);
  const xyz = new Float32Array(total * 3);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let at = 0;
  for (const { positions: p, count, matrix: m } of sources) {
    for (let start = 0; start < count; start += CHUNK_POINTS) {
      const end = Math.min(count, start + CHUNK_POINTS);
      const t = m && m.length === 16 ? m : IDENTITY;
      for (let i = start; i < end; i++, at++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        const qx = t[0] * x + t[4] * y + t[8] * z + t[12];
        const qy = t[1] * x + t[5] * y + t[9] * z + t[13];
        const qz = t[2] * x + t[6] * y + t[10] * z + t[14];
        xyz[at * 3] = qx;
        xyz[at * 3 + 1] = qy;
        xyz[at * 3 + 2] = qz;
        if (qx < lo[0]) lo[0] = qx;
        if (qx > hi[0]) hi[0] = qx;
        if (qy < lo[1]) lo[1] = qy;
        if (qy > hi[1]) hi[1] = qy;
        if (qz < lo[2]) lo[2] = qz;
        if (qz > hi[2]) hi[2] = qz;
      }
      onProgress?.(total ? at / total : 1);
      await yieldToPage();
    }
  }
  const bounds = at > 0 && lo.every(Number.isFinite) ? { min: { x: lo[0], y: lo[1], z: lo[2] }, max: { x: hi[0], y: hi[1], z: hi[2] } } : null;
  return { xyz, count: at, bounds };
}

/** The median of the points in plan (x, z), from a sample of at most `sample` points: where the scan mostly is, which an L- or T-shaped scan's box centre is not. */
export function scanCentre(points: ScanPoints, sample = 200_000): { x: number; z: number } | null {
  if (points.count === 0) return null;
  const step = Math.max(1, Math.floor(points.count / sample));
  const n = Math.ceil(points.count / step);
  const xs = new Float32Array(n), zs = new Float32Array(n);
  for (let i = 0, k = 0; i < points.count && k < n; i += step, k++) { xs[k] = points.xyz[i * 3]; zs[k] = points.xyz[i * 3 + 2]; }
  xs.sort();
  zs.sort();
  return { x: xs[n >> 1], z: zs[n >> 1] };
}

/** Forget the gathered points (tests; a scan removed is noticed by its key). */
export function forgetScanPoints(): void {
  cached = null;
  pending = null;
}
