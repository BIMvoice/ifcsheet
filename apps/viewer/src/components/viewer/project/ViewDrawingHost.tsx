/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One open drawing tab's own generator (phase 3b). It runs the viewer's
 * drawing pipeline (`useDrawingGeneration`, `primary: false`) on the
 * view's own plane and display overrides, and keeps the result in
 * `view-drawings.ts`, so every open view holds its drawing while other tabs
 * are in front.
 *
 * A view is independent of the 3D view's hide / isolate state, like a Revit
 * view: only the class-level visibility toggles (spaces, openings…) apply,
 * and the phases the view does not show (`project/phases.ts`).
 * Geometry is the federated set `DrawingRuntimeHost` publishes.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { drawingAsViewShows } from '@/project/view-appearance';
import { useViewerStore } from '@/store';
import { useIfc } from '@/hooks/useIfc';
import { useDrawingGeneration } from '@/hooks/useDrawingGeneration';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { useProjectStore } from '@/project/project-store';
import { phaseHiddenIds, phaseViewOf } from '@/project/phase-view';
import { sectionPlaneForView } from '@/project/view-plane';
import { dropViewDrawing, generatesFromModel, patchViewDrawing, planeKey, useViewDrawings, viewDisplayOverrides } from '@/project/view-drawings';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { ProjectView } from '@/project/types';
import { isScanOnly } from '@/scan/scan-points';
import { ScanDrawingHost } from './ScanDrawingHost';

const NO_HIDDEN = new Set<number>();
const FALLBACK_PLANE = { axis: 'down' as const, position: 50, flipped: false };

export function ViewDrawingHost({ view }: { view: Exclude<ProjectView, { kind: '3d' }> }): ReactElement | null {
  const models = useViewerStore((s) => s.models);
  const { geometryResult } = useDrawingRuntime();
  // A drafting view has no model behind it: nothing to generate, and no hooks to run for it.
  if (!generatesFromModel(view)) return null;
  // Scans and nothing else: the view is sliced from the points (#181).
  return isScanOnly(models, geometryResult?.meshes?.length ?? 0) ? <ScanDrawingHost view={view} /> : <ModelDrawingHost view={view} />;
}

function ModelDrawingHost({ view }: { view: Exclude<ProjectView, { kind: '3d' }> }): null {
  const viewId = view.id;
  const { geometryResult } = useDrawingRuntime();
  const { ifcDataStore } = useIfc();
  const models = useViewerStore((s) => s.models);
  const legacyGeometry = useViewerStore((s) => s.geometryResult);
  const typeVisibility = useViewerStore((s) => s.typeVisibility);
  const sharedOptions = useViewerStore((s) => s.drawing2DDisplayOptions);
  const levels = useProjectStore((s) => s.levels);
  const drawing = useViewDrawings((s) => s.byView[viewId]?.drawing ?? null);

  // Resolve the view's plane against the live bounds; keyed so an identical
  // plane keeps its object identity and the generator sees no change.
  const bounds = mergedSectionBounds(models, legacyGeometry);
  const resolved = sectionPlaneForView(view, bounds, levels);
  const key = planeKey(resolved);
  const planeRef = useRef<{ key: string; plane: typeof FALLBACK_PLANE | NonNullable<typeof resolved> }>({ key: '', plane: FALLBACK_PLANE });
  if (planeRef.current.key !== key) planeRef.current = { key, plane: resolved ?? FALLBACK_PLANE };
  const sectionPlane = planeRef.current.plane;

  // A view that draws by phase leaves the elements of the phases it does not show out of the generator's input
  // (as a hidden element is), so they occlude, hatch and symbolize nothing. A new set regenerates the drawing.
  const phaseSource = useProjectStore((s) => s.phaseSource);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const phases = view.graphics?.phases;
  const hiddenByPhase = useMemo(
    () => phaseHiddenIds(geometryResult?.meshes, phaseViewOf(phases ? { phases } : undefined, phaseSource)) ?? NO_HIDDEN,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a Status edit (mutationVersion) changes the phases; `phases` is read by its shown set
    [geometryResult, phases?.show.join(), phaseSource, mutationVersion],
  );

  const { showConstructionProjection, constructionProjectionDepth } = viewDisplayOverrides(view);
  const displayOptions = useMemo(
    () => ({ ...sharedOptions, showConstructionProjection, constructionProjectionDepth }),
    [sharedOptions, showConstructionProjection, constructionProjectionDepth],
  );

  // The generator's drawing is kept whole; the view stores it as it shows it (hidden lines, outline).
  const generated = useRef<Drawing2D | null>(null);
  const interior = view.kind === 'elevation' ? view.interior : undefined;
  const setDrawing = useCallback((d: Drawing2D | null) => {
    generated.current = d;
    patchViewDrawing(viewId, { drawing: d ? drawingAsViewShows(d, { kind: view.kind, showHidden: view.showHidden, detail: view.detail, interior }) : null });
  }, [viewId, view.kind, view.showHidden, view.detail, interior]);
  useEffect(() => {
    if (generated.current) patchViewDrawing(viewId, { drawing: drawingAsViewShows(generated.current, { kind: view.kind, showHidden: view.showHidden, detail: view.detail, interior }) });
  }, [viewId, view.kind, view.showHidden, view.detail, interior]);
  const setDrawingStatus = useCallback((status: 'idle' | 'generating' | 'ready' | 'error') => patchViewDrawing(viewId, { status }), [viewId]);
  const setDrawingProgress = useCallback((progress: number, phase: string) => patchViewDrawing(viewId, { progress, phase }), [viewId]);
  const setDrawingError = useCallback((error: string | null) => patchViewDrawing(viewId, { error, ...(error ? { status: 'error' as const } : {}) }), [viewId]);

  useDrawingGeneration({
    geometryResult,
    ifcDataStore,
    sectionPlane,
    displayOptions,
    typeVisibility,
    combinedHiddenIds: hiddenByPhase,
    combinedIsolatedIds: null,
    computedIsolatedIds: null,
    models,
    // An open tab keeps its drawing current; an unresolved view (level not loaded) does not generate.
    panelVisible: resolved !== null,
    activeTool: 'select',
    drawing,
    setDrawing,
    setDrawingStatus,
    setDrawingProgress,
    setDrawingError,
    primary: false,
  });

  // An empty model (no geometry, no bounds) is not an error: the view is a bare work plane.
  const hasGeometry = bounds !== null;
  useEffect(() => {
    if (!key && hasGeometry) patchViewDrawing(viewId, { status: 'error', error: 'This view cannot resolve: its level is not in the loaded models.' });
  }, [key, viewId, hasGeometry]);
  useEffect(() => () => dropViewDrawing(viewId), [viewId]);
  return null;
}
