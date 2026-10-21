/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #181: a scan opened on an empty project left the Wall on "Reading the
 * model…" for good, because the set was laid out only once meshes came in and
 * a point cloud brings none. A scan (a synthetic 10 x 6 x 3 m room, held the
 * way the viewer's scan cache holds a streamed LAS or E57) now gives a set:
 * a plan at its floor, sections across it, and the Wall says what a scan gives.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GeometryResult } from '@ifc-lite/geometry';
import { cleanup, render, waitFor } from '@/test/render.js';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { resetProject, useProjectStore } from '@/project/project-store';
import { addPointsToScanCache, clearAllPointCloudScanCaches, registerPointCloudScanCache } from '@/hooks/ingest/pointCloudScanCache';
import { ROOM, roomPoints } from '@/test/scan-fixture';
import { forgetScanPoints } from '@/scan/scan-points';
import { resetScanState, useScanState } from '@/scan/scan-start';
import { isScanPlan } from '@/project/scan-set';
import { useViewerStore } from '@/store';
import { WallView } from './WallView';

const HANDLE = 181;
const ZERO = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };

/** A scan loaded as `useIfcLoader` registers one: no meshes, its points in the scan cache under its renderer handle. */
function openScan(): void {
  const positions = roomPoints([ROOM]);
  registerPointCloudScanCache(HANDLE);
  addPointsToScanCache(HANDLE, { positions, normalState: 'absent', pointCount: positions.length / 3 });
  const geometryResult = { meshes: [], pointClouds: [], totalVertices: 0, totalTriangles: 0, coordinateInfo: { shiftedBounds: ZERO, originalBounds: ZERO } };
  useViewerStore.setState({ models: new Map([['scan', { id: 'scan', name: 'room.e57', visible: true, loadState: 'complete', pointCloudHandleId: HANDLE, geometryResult } as never]]) });
  publishDrawingRuntime({ geometryResult: geometryResult as unknown as GeometryResult, sourceCoordinateInfo: undefined, generateDrawing: async () => undefined, isRegenerating: false });
}

beforeEach(() => {
  resetProject();
  resetScanState();
  forgetScanPoints();
  clearAllPointCloudScanCaches();
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
  useViewerStore.setState({ models: new Map() });
});

describe('the Wall on a scan', () => {
  it('lays out a set of plans and sections instead of waiting for meshes', async () => {
    openScan();
    const page = render(<WallView />);
    await waitFor(() => useProjectStore.getState().sheets.length > 0, 'the set laid out from the scan');
    const { sheets, views, scanLevels } = useProjectStore.getState();
    // One level found at the floor; its plan and the two sections hang, nothing else.
    assert.equal(scanLevels?.length, 1);
    assert.ok(Math.abs(scanLevels![0].elevation - ROOM.floor) < 0.06, String(scanLevels![0].elevation));
    const hung = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
    const hungViews = views.filter((v) => hung.has(v.id));
    assert.equal(hungViews.filter(isScanPlan).length, 1);
    assert.equal(hungViews.filter((v) => v.kind === 'section').length, 2);
    assert.deepEqual(hungViews.filter((v) => v.kind === 'elevation' || v.kind === '3d'), []);
    assert.ok(sheets.some((s) => s.number === 'A-101'), sheets.map((s) => s.number).join(', '));
    // The extent is the scan's.
    const bounds = useScanState.getState().bounds!;
    assert.ok(Math.abs(bounds.max.x - bounds.min.x - 10) < 0.05 && Math.abs(bounds.max.z - bounds.min.z - 6) < 0.05);
    // And it says what a scan gives, and what it does not.
    await waitFor(() => /sliced from the points of the scan/.test(page.textContent ?? ''), 'the scan intro');
    assert.match(page.textContent ?? '', /no elevations, tags or schedules/);
  });

  it('keeps the levels a saved project already set', async () => {
    useProjectStore.setState({ scanLevels: [{ id: 'l-a', name: 'Parter', elevation: 0 }, { id: 'l-b', name: 'Mezanin', elevation: 1.5 }] });
    openScan();
    render(<WallView />);
    await waitFor(() => useProjectStore.getState().sheets.length > 0, 'the set laid out from the scan');
    const plans = useProjectStore.getState().views.filter(isScanPlan);
    assert.deepEqual(plans.map((p) => p.name).sort(), ['Mezanin', 'Parter']);
  });

  it('says in words that a scan with no points cannot be drawn, instead of reading for ever', async () => {
    registerPointCloudScanCache(HANDLE);
    useViewerStore.setState({ models: new Map([['scan', { id: 'scan', name: 'empty.las', visible: true, loadState: 'complete', pointCloudHandleId: HANDLE, geometryResult: { meshes: [], pointClouds: [] } } as never]]) });
    const page = render(<WallView />);
    await waitFor(() => /holds no points/.test(page.textContent ?? ''), 'the empty-scan message');
    assert.equal(useProjectStore.getState().sheets.length, 0);
    assert.doesNotMatch(page.textContent ?? '', /Reading the model/);
  });
});
