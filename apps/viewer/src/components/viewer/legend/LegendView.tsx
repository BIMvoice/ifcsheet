/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A legend tab: the legend as it prints (paper millimetres, zoomable) next to
 * its settings — what it covers, which categories in which order, columns,
 * row height, text style, title — and SVG / DXF export. Drag it from the
 * Project Navigator onto a sheet to place it.
 */

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Minus, Plus } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import { LEGEND_CATEGORIES, type LegendCategory, type ProjectLegend } from '@/catalogue/types';
import { moveLegendCategory, toggleLegendCategory, updateLegend } from '@/legend/legend-actions';
import { useProjectStore } from '@/project/project-store';
import { svgToDxf } from '../sheets/sheet-dxf';
import { LegendGraphic, useLegendLayout } from './LegendGraphic';

const FIELD = 'h-7 w-44 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';
const MARGIN = 10;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Num({ label, value, min, max, step = 1, onCommit }: { label: string; value: number; min: number; max: number; step?: number; onCommit: (v: number) => void }) {
  return (
    <input type="number" aria-label={label} className={`${FIELD} w-24 text-right tabular-nums`} min={min} max={max} step={step} defaultValue={value} key={value}
      onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min && v <= max && v !== value) onCommit(v); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Settings of a legend. */
export function LegendSettings({ legend }: { legend: ProjectLegend }) {
  const { t } = useTranslation();
  const views = useProjectStore((s) => s.views);
  const sheets = useProjectStore((s) => s.sheets);
  const textStyles = useProjectStore((s) => s.textStyles) ?? [];
  const set = (patch: Partial<ProjectLegend>) => updateLegend(legend.id, patch);
  const move = (i: number, by: -1 | 1) => moveLegendCategory(legend.id, i, by);
  const toggle = (c: LegendCategory) => toggleLegendCategory(legend.id, c);
  const hidden = LEGEND_CATEGORIES.filter((c) => !legend.categories.includes(c));
  return (
    <aside className="w-80 shrink-0 space-y-1 overflow-y-auto border-l border-zinc-200 p-3 text-xs dark:border-zinc-800" aria-label={t('legend.folder')}>
      <Row label={t('legend.title')}>
        <input aria-label={t('legend.title')} className={FIELD} defaultValue={legend.title} key={legend.title} onBlur={(e) => e.target.value !== legend.title && set({ title: e.target.value })} />
      </Row>
      <Row label={t('legend.showTitle')}><input type="checkbox" aria-label={t('legend.showTitle')} checked={legend.showTitle} onChange={(e) => set({ showTitle: e.target.checked })} /></Row>
      <Row label={t('legend.scope')}>
        <select aria-label={t('legend.scope')} className={FIELD} value={legend.scope} onChange={(e) => set({ scope: e.target.value as ProjectLegend['scope'], scopeId: undefined })}>
          {(['project', 'view', 'sheet'] as const).map((s) => <option key={s} value={s}>{t(`legend.scope.${s}` as TranslationKey)}</option>)}
        </select>
      </Row>
      {legend.scope === 'view' ? (
        <Row label={t('legend.scopeTarget')}>
          <select aria-label={t('legend.scopeTarget')} className={FIELD} value={legend.scopeId ?? ''} onChange={(e) => set({ scopeId: e.target.value || undefined })}>
            <option value="">{t('legend.scope.project')}</option>
            {views.filter((v) => v.kind !== '3d').map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </Row>
      ) : null}
      {legend.scope === 'sheet' ? (
        <Row label={t('legend.scopeTarget')}>
          <select aria-label={t('legend.scopeTarget')} className={FIELD} value={legend.scopeId ?? ''} onChange={(e) => set({ scopeId: e.target.value || undefined })}>
            <option value="">{t('legend.scope.sheetOwn')}</option>
            {sheets.map((s) => <option key={s.id} value={s.id}>{s.number} {s.name}</option>)}
          </select>
        </Row>
      ) : null}
      <div className="pt-2 text-zinc-500">{t('legend.categories')}</div>
      <ul className="space-y-0.5">
        {legend.categories.map((c, i) => (
          <li key={c} className="flex items-center gap-1">
            <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked onChange={() => toggle(c)} />{t(`legend.category.${c}` as TranslationKey)}</label>
            <IconButton label={`${t('legend.moveUp')} ${t(`legend.category.${c}` as TranslationKey)}`} className="size-6" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-3" /></IconButton>
            <IconButton label={`${t('legend.moveDown')} ${t(`legend.category.${c}` as TranslationKey)}`} className="size-6" disabled={i === legend.categories.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-3" /></IconButton>
          </li>
        ))}
        {hidden.map((c) => (
          <li key={c}><label className="flex items-center gap-2 text-zinc-500"><input type="checkbox" checked={false} onChange={() => toggle(c)} />{t(`legend.category.${c}` as TranslationKey)}</label></li>
        ))}
      </ul>
      <Row label={t('legend.headings')}><input type="checkbox" aria-label={t('legend.headings')} checked={legend.headings} onChange={(e) => set({ headings: e.target.checked })} /></Row>
      <Row label={t('legend.columns')}><Num label={t('legend.columns')} value={legend.columns} min={1} max={6} onCommit={(columns) => set({ columns })} /></Row>
      <Row label={t('legend.rowHeight')}><Num label={t('legend.rowHeight')} value={legend.rowHeight} min={3} max={30} step={0.5} onCommit={(rowHeight) => set({ rowHeight })} /></Row>
      <Row label={t('legend.swatchWidth')}><Num label={t('legend.swatchWidth')} value={legend.swatchWidth} min={6} max={80} step={1} onCommit={(swatchWidth) => set({ swatchWidth })} /></Row>
      <Row label={t('legend.textStyle')}>
        <select aria-label={t('legend.textStyle')} className={FIELD} value={legend.textStyle} onChange={(e) => set({ textStyle: e.target.value })}>
          {textStyles.map((s) => <option key={s.id} value={s.id}>{t('legend.textStyleOption', { name: s.name, height: s.height })}</option>)}
        </select>
      </Row>
      <p className="pt-2 text-2xs text-zinc-500">{t('legend.materialsHint')}</p>
      <p className="text-2xs text-zinc-500">{t('legend.hint')}</p>
    </aside>
  );
}

export function LegendView({ legend }: { legend: ProjectLegend }) {
  const { t } = useTranslation();
  const layout = useLegendLayout(legend);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(4);
  const stem = sanitizeFilename(legend.name, { fallback: 'legend' });
  if (!layout) return null;
  const w = layout.width + 2 * MARGIN, h = layout.height + 2 * MARGIN;
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', `${w}mm`);
    clone.setAttribute('height', `${h}mm`);
    downloadFile(`<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`, `${stem}.svg`, 'image/svg+xml');
  };
  const exportDxf = () => {
    if (svgRef.current) downloadFile(svgToDxf(svgRef.current, h, `units: millimetres (paper), legend ${legend.name}`), `${stem}.dxf`, 'application/dxf');
  };
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-200 px-2 text-xs dark:border-zinc-800">
        <span className="font-semibold">{legend.name}</span>
        <span className="flex-1" />
        <IconButton label={t('legend.zoomOut')} className="size-7" onClick={() => setZoom((z) => Math.max(1, z / 1.25))}><Minus className="size-3.5" /></IconButton>
        <IconButton label={t('legend.zoomIn')} className="size-7" onClick={() => setZoom((z) => Math.min(12, z * 1.25))}><Plus className="size-3.5" /></IconButton>
        <Button size="sm" variant="outline" onClick={exportSvg}><Download className="mr-1 size-3.5" />{t('legend.export.svg')}</Button>
        <Button size="sm" variant="outline" onClick={exportDxf}><Download className="mr-1 size-3.5" />{t('legend.export.dxf')}</Button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 dark:bg-zinc-900">
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={w * zoom} height={h * zoom} viewBox={`${-MARGIN} ${-MARGIN} ${w} ${h}`} className="block bg-white shadow-lg" data-legend-paper>
            <rect data-export-ignore-dxf="true" x={-MARGIN} y={-MARGIN} width={w} height={h} fill="#fff" />
            <LegendGraphic layout={layout} />
          </svg>
          {layout.prims.length <= 3 ? <p className="p-4 text-sm text-zinc-500">{t('legend.empty')}</p> : null}
        </div>
        <LegendSettings legend={legend} />
      </div>
    </div>
  );
}
