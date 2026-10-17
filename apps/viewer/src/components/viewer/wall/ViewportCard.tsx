/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The card for the drawing chosen on a sheet: its name, its scale, its cut
 * or depth, opening it to draw in, taking it off the sheet; and below, any
 * drawing or schedule not yet on this sheet, to place on it.
 */

import { useTranslation } from '@/i18n';
import { placeLegend } from '@/legend/legend-actions';
import { renameProjectItem, updateProjectView, useProjectStore } from '@/project/project-store';
import { addViewport, removeViewport, SHEET_SCALES, updateViewport } from '@/project/sheets';
import { drawingArea } from '@/project/drawing-set';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { useLegendLabels } from '../legend/LegendGraphic';
import { LegendCard } from './LegendCard';
import { CutHeightControl, DepthControl } from './ViewControls';

const field = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-base text-white';
const quiet = 'rounded-full border border-sky-300/30 px-3 py-1.5 text-sm text-sky-100 hover:border-sky-300/70';

interface ViewportCardProps {
  sheet: ProjectSheet;
  slot: SheetViewport | null;
  onOpen: (vp: SheetViewport) => void;
  onChoose: (viewportId: string | null) => void;
}

export function ViewportCard({ sheet, slot, onOpen, onChoose }: ViewportCardProps) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const view = views.find((v) => v.id === slot?.viewId);
  const legends = useProjectStore((s) => s.legends ?? []);
  const labels = useLegendLabels();
  const schedule = schedules.find((s) => s.id === slot?.viewId);
  const legend = legends.find((l) => l.id === slot?.viewId);
  const name = view?.name ?? schedule?.name ?? legend?.name ?? '';
  const placed = new Set((sheet.viewports ?? []).map((vp) => vp.viewId));
  const placeable = [
    ...views.filter((v) => v.kind !== '3d' && !placed.has(v.id)).map((v) => ({ id: v.id, name: v.name })),
    ...schedules.filter((s) => !placed.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
    ...legends.filter((l) => !placed.has(l.id)).map((l) => ({ id: l.id, name: l.name })),
  ];

  const place = (id: string): void => {
    // A legend sets its own size, at paper size, in a free place.
    if (legends.some((l) => l.id === id)) {
      onChoose(placeLegend(sheet.id, id, labels));
      return;
    }
    const area = drawingArea(sheet.paper);
    const scale = views.find((v) => v.id === id)?.scale ?? slot?.scale ?? 100;
    onChoose(addViewport(sheet.id, id, { x: area.x + area.w / 2, y: area.y + area.h / 2 }, scale));
  };

  return (
    <aside className="w-[340px] rounded-2xl border border-sky-300/20 bg-[#0b2348]/95 p-6 text-sky-100 shadow-2xl backdrop-blur">
      {slot ? (
        <>
          <p className="m-0 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{t('wall.vp.eyebrow')}</p>
          <label className="mt-2 block text-sm text-sky-200">
            {t('wall.project.rename')}
            <input key={slot.viewId} className={field} defaultValue={name} onBlur={(e) => renameProjectItem(slot.viewId, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </label>
          {legend ? <LegendCard legend={legend} /> : (
            <label className="mt-3 block text-sm text-sky-200">
              {t('wall.vp.scale')}
              <select
                className={field}
                value={slot.scale}
                onChange={(e) => {
                  const scale = Number(e.target.value);
                  // The box fits the drawing again at the new scale; the view's annotation sizes follow it.
                  updateViewport(sheet.id, slot.id, { scale, width: 0, height: 0 });
                  if (view) updateProjectView(view.id, { scale });
                }}
              >
                {SHEET_SCALES.map((s) => <option key={s} value={s}>{`1 : ${s}`}</option>)}
              </select>
            </label>
          )}
          {view?.kind === 'plan' ? <div className="mt-4"><CutHeightControl view={view} /></div> : null}
          {view?.kind === 'section' || view?.kind === 'elevation' ? <div className="mt-4"><DepthControl view={view} /></div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {view ? <button type="button" className={quiet} onClick={() => onOpen(slot)}>{t('wall.vp.open')}</button> : null}
            <button type="button" className={quiet} onClick={() => { removeViewport(sheet.id, slot.id); onChoose(null); }}>{t('wall.vp.remove')}</button>
          </div>
        </>
      ) : (
        <p className="m-0 text-sm text-sky-200">{t('wall.vp.none')}</p>
      )}
      {placeable.length > 0 ? (
        <label className="mt-5 block border-t border-sky-300/20 pt-4 text-sm text-sky-200">
          {t('wall.vp.place')}
          <select className={field} value="" onChange={(e) => e.target.value && place(e.target.value)}>
            <option value="">{t('wall.vp.placePick')}</option>
            {placeable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : null}
    </aside>
  );
}
