/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A scan opened on a project with no set (#181): its points are gathered
 * (`scan-points.ts`), its floors guessed where the project has no levels of
 * its own yet (`scan-levels.ts`), and the set laid out from them
 * (`ensureDrawingSet` with `scan`). The state is what the Wall shows while
 * that runs: the share gathered, then ready, or why nothing could be drawn.
 */

import { create } from 'zustand';
import { resolve } from '@/i18n/registry';
import type { AxisBounds } from '@/lib/section/section-distance';
import { hangView, startDrawingSet } from '@/project/drawing-set-actions';
import { isSetSheet } from '@/project/drawing-set';
import { useProjectStore } from '@/project/project-store';
import { setScanLevels } from '@/project/scan-set';
import { freshProjectId } from '@/project/view-defaults';
import type { FederatedModel } from '@/store/types';
import { guessFloors, type ScanLevel } from './scan-levels';
import { gatherScanPoints, scanCentre } from './scan-points';

export type ScanPhase = 'idle' | 'gathering' | 'ready' | 'empty' | 'error';

export interface ScanState {
  phase: ScanPhase;
  /** 0..1 while gathering. */
  progress: number;
  /** The scan's extent in the drawing frame, once gathered. */
  bounds: AxisBounds | null;
  /** Points the drawings are sliced from. */
  points: number;
  /** Milliseconds the gathering took (measured, for the record). */
  gatherMs: number;
  error: string | null;
}

const IDLE: ScanState = { phase: 'idle', progress: 0, bounds: null, points: 0, gatherMs: 0, error: null };
export const useScanState = create<ScanState>()(() => ({ ...IDLE }));

/** Forget the last scan (another model, a new project). */
export function resetScanState(): void {
  if (useScanState.getState().phase !== 'idle') useScanState.setState({ ...IDLE });
}

/** Points the floor guess reads at most: a sample is plenty for a histogram. */
const LEVEL_SAMPLE = 500_000;

/** The levels a scan opens with: guessed from its points, named Level 0, Level 1… from the lowest, to the centimetre. */
export function guessedScanLevels(xyz: Float32Array, count: number): ScanLevel[] {
  const { floors } = guessFloors(xyz, count, Math.max(1, Math.floor(count / LEVEL_SAMPLE)));
  return floors.map((elevation, n) => ({ id: freshProjectId('level'), name: resolve('names.scan.level', { n }), elevation: Math.round(elevation * 100) / 100 }));
}

/**
 * Gather the scans of `models` and, on a project with no set sheets, lay the
 * set out from them. Returns whether a set was laid out. A project that
 * already has scan levels keeps them.
 */
export async function startScanDrawingSet(models: ReadonlyMap<string, FederatedModel>): Promise<boolean> {
  if (useScanState.getState().phase === 'gathering') return false;
  useScanState.setState({ ...IDLE, phase: 'gathering' });
  const started = performance.now();
  try {
    const points = await gatherScanPoints(models, (progress) => useScanState.setState({ progress }));
    const gatherMs = Math.round(performance.now() - started);
    if (points.count === 0 || !points.bounds) {
      useScanState.setState({ phase: 'empty', progress: 1, gatherMs });
      return false;
    }
    let levels = useProjectStore.getState().scanLevels ?? [];
    if (levels.length === 0) {
      levels = guessedScanLevels(points.xyz, points.count);
      useProjectStore.setState({ scanLevels: levels });
    }
    useScanState.setState({ phase: 'ready', progress: 1, bounds: points.bounds, points: points.count, gatherMs });
    if (useProjectStore.getState().sheets.some(isSetSheet)) return false;
    return startDrawingSet(null, points.bounds, { scan: { levels, centre: scanCentre(points) } });
  } catch (err) {
    console.warn('[ifcsheet] the scan could not be read for drawing', err);
    useScanState.setState({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Change the scan's levels (`setScanLevels`); a plan made for a new level is hung on the set. */
export function applyScanLevels(levels: readonly ScanLevel[]): void {
  const extent = useScanState.getState().bounds;
  for (const id of setScanLevels(levels)) if (extent) hangView(id, extent);
}
