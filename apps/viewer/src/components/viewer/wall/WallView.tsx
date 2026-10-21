/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall: the drawing set as one surface. When a model opens on a project
 * with no sheets, the set is laid out at once (`startDrawingSet`) and the
 * model's arrival is announced; then every sheet hangs in view, and one can be
 * stepped into to be corrected where it hangs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { isSetSheet } from '@/project/drawing-set';
import { sectionProposals, startDrawingSet } from '@/project/drawing-set-actions';
import { setExtent } from '@/draft-set/body';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { EVENT_WALL_HUNG, emitWallHung } from '@/lib/tours/events';
import { SteppedSheet } from './SteppedSheet';
import { WallGrid } from './WallGrid';
import { WallIntro } from './WallIntro';
import { WallWaiting } from './WallWaiting';
import { isScanOnly } from '@/scan/scan-points';
import { resetScanState, startScanDrawingSet, useScanState } from '@/scan/scan-start';
import { openDemoModel } from '../ifcsheet/demo-model';
import { ProjectDrawer } from './ProjectDrawer';
import { IssuePanel, MissingPanel } from './SetPanels';
import { setDrawer, stepInto, useWallNav } from './wall-nav';

export function WallView() {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const legacy = useViewerStore((s) => s.geometryResult);
  const { geometryResult } = useDrawingRuntime();
  const meshes = geometryResult?.meshes ?? null;
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  const levels = useProjectStore((s) => s.levels);
  // Measured on the building, not on the site around it; the main body of the model when no storey holds geometry.
  const modelExtent = useMemo(() => setExtent(levels, meshes, mergedSectionBounds(models, legacy)).extent, [levels, meshes, models, legacy]);
  // Scans and nothing else (#181): no meshes, so the extent is the scan's, once its points are gathered.
  const scanOnly = isScanOnly(models, meshes?.length ?? 0);
  const scanBounds = useScanState((s) => s.bounds);
  const extent = modelExtent ?? (scanOnly ? scanBounds : null);
  const [intro, setIntro] = useState(false);
  const { stepped, focus, visit, drawer, panel } = useWallNav();

  // A model on a project with no set sheets (interior elevations alone do not count): lay the set out as soon as the geometry is in.
  const hasSet = sheets.some(isSetSheet);
  useEffect(() => {
    if (!hasSet && meshes && meshes.length > 0 && startDrawingSet(meshes, extent)) setIntro(true);
  }, [hasSet, meshes, extent]);
  useEffect(() => {
    if (!scanOnly) {
      resetScanState();
      return;
    }
    // Gathered on any open, so a saved set reopened has its extent; laid out only on a project with no set (again when every set sheet is removed, as for a model).
    void startScanDrawingSet(models).then((started) => { if (started) setIntro(true); });
  }, [scanOnly, models, hasSet]);

  // The proposals read the lowest plan's rooms; they change only with the model or the plans.
  const proposals = useMemo(() => sectionProposals(meshes, extent), [meshes, extent, views]);
  const back = useCallback(() => stepInto(null), []);
  // Hanging goes by the event, so the tour can hang the set too (its steps skip the intro the same way).
  const hang = useCallback(() => emitWallHung(), []);
  useEffect(() => {
    const onHung = () => setIntro(false);
    window.addEventListener(EVENT_WALL_HUNG, onHung);
    return () => window.removeEventListener(EVENT_WALL_HUNG, onHung);
  }, []);
  const steppedSheet = sheets.find((s) => s.id === stepped) ?? null;
  const modelName = [...models.values()][0]?.name ?? '';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,#0c2a52,#061a36_60%)] text-sky-50">
      {models.size === 0 && !legacy ? (
        <div className="flex h-full flex-col items-center justify-center gap-6 text-lg text-sky-200/80">
          <p className="m-0">{t('wall.empty')}</p>
          <button type="button" className="rounded-md bg-sky-600 px-5 py-2.5 text-base text-white hover:bg-sky-500" onClick={() => void openDemoModel().catch((err: unknown) => console.warn('[ifcsheet] could not open the demo project', err))}>
            {t('wall.demo')}
          </button>
        </div>
      ) : sheets.length === 0 ? (
        <WallWaiting scan={scanOnly} />
      ) : intro && extent ? (
        <WallIntro modelName={modelName} extent={extent} onHang={hang} scan={scanOnly} />
      ) : steppedSheet ? (
        <SteppedSheet key={`${steppedSheet.id}:${visit}`} sheet={steppedSheet} extent={extent} proposals={proposals} initialFocus={focus} onBack={back} onStep={(id) => stepInto(id)} />
      ) : (
        <WallGrid extent={extent} onStep={(id) => stepInto(id)} />
      )}
      {drawer ? <ProjectDrawer extent={extent} onClose={() => setDrawer(false)} /> : null}
      {panel === 'missing' ? <MissingPanel /> : panel === 'issue' ? <IssuePanel /> : null}
    </div>
  );
}
