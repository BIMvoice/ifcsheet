/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One view's drawing when the loaded models are scans (#181): a plan or a
 * section sliced from the points (`scan/scan-drawing.ts`), kept in
 * `view-drawings.ts` like a model view's drawing, so the sheets, the print and
 * the DXF read it the same way. It is sliced again when the view's cut, its
 * scale or the scans change. A view a scan does not slice (an elevation) has
 * no drawing.
 */

import { useEffect } from 'react';
import { useProjectStore } from '@/project/project-store';
import { dropViewDrawing, patchViewDrawing } from '@/project/view-drawings';
import type { ProjectView } from '@/project/types';
import { scanDrawing, scanSliceForView } from '@/scan/scan-drawing';
import { gatherScanPoints } from '@/scan/scan-points';
import { useViewerStore } from '@/store';

export function ScanDrawingHost({ view }: { view: ProjectView }): null {
  const models = useViewerStore((s) => s.models);
  const levels = useProjectStore((s) => s.levels);
  const slice = scanSliceForView(view, levels);
  const key = slice ? JSON.stringify([slice.config, view.scale ?? 100]) : '';

  useEffect(() => {
    if (!key) {
      patchViewDrawing(view.id, { drawing: null, status: 'idle', error: null });
      return;
    }
    let live = true;
    patchViewDrawing(view.id, { status: 'generating', progress: 0, error: null });
    gatherScanPoints(models)
      .then((points) => scanDrawing(points, view, levels))
      .then((drawing) => { if (live) patchViewDrawing(view.id, { drawing, status: 'ready', progress: 100 }); })
      .catch((err: unknown) => {
        console.warn('[ifcsheet] a scan view could not be sliced', err);
        if (live) patchViewDrawing(view.id, { status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => { live = false; };
    // The key is the view's cut and scale; the rest of the view does not change what is sliced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, models, view.id]);

  useEffect(() => () => dropViewDrawing(view.id), [view.id]);
  return null;
}
