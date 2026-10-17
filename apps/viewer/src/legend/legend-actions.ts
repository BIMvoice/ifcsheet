/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Legends as project items: create, change their configuration, duplicate,
 * place on a sheet. The classic legend tab and the Wall both call these, and
 * nothing here reaches the drafting session, so they work while a tool runs.
 * Removing is `removeProjectItem`, which also takes a legend off the sheets.
 */

import { DEFAULT_LEGEND, type LegendCategory, type LegendConfig, type ProjectLegend } from '@/catalogue/types';
import { drawingArea } from '@/project/drawing-set';
import { useProjectStore } from '@/project/project-store';
import { addViewport, viewportBox } from '@/project/sheets';
import type { ProjectSheet } from '@/project/types';
import { freshProjectId } from '@/project/view-defaults';
import { useViewDrawings } from '@/project/view-drawings';
import { layoutOf, readLegendEnv } from './legend-env';
import type { LegendLabels } from './legend-layout';
import { freeSpot, type Rect } from './legend-spot';

export const projectLegends = (): ProjectLegend[] => useProjectStore.getState().legends ?? [];

/** A new legend; `config` sets what it lists (`scope` binds it to a view or sheet when it is made from one). Returns its id. */
export function addLegend(name: string, config: Partial<LegendConfig> = {}): string {
  const id = freshProjectId('legend');
  const legend: ProjectLegend = { ...DEFAULT_LEGEND, title: name, ...config, categories: [...(config.categories ?? DEFAULT_LEGEND.categories)], id, name, createdAt: Date.now() };
  useProjectStore.setState({ legends: [...projectLegends(), legend], dirty: true });
  return id;
}

export function updateLegend(id: string, patch: Partial<Omit<ProjectLegend, 'id' | 'createdAt'>>): void {
  useProjectStore.setState({ legends: projectLegends().map((l) => (l.id === id ? { ...l, ...patch } : l)), dirty: true });
}

export function duplicateLegend(id: string, name: string): string | null {
  const source = projectLegends().find((l) => l.id === id);
  if (!source) return null;
  const copy: ProjectLegend = { ...structuredClone(source), id: freshProjectId('legend'), name, createdAt: Date.now() };
  useProjectStore.setState({ legends: [...projectLegends(), copy], dirty: true });
  return copy.id;
}

/** Switch a category on (at the end of the list) or off. */
export function toggleLegendCategory(id: string, category: LegendCategory): void {
  const legend = projectLegends().find((l) => l.id === id);
  if (!legend) return;
  const on = legend.categories.includes(category);
  const categories = on ? legend.categories.filter((c) => c !== category) : [...legend.categories, category];
  updateLegend(id, { categories });
}

/** Move the category at `index` one place up (`-1`) or down (`1`) in the order the legend lists them. */
export function moveLegendCategory(id: string, index: number, by: -1 | 1): void {
  const legend = projectLegends().find((l) => l.id === id);
  if (!legend || index + by < 0 || index + by >= legend.categories.length) return;
  const categories = [...legend.categories];
  [categories[index], categories[index + by]] = [categories[index + by], categories[index]];
  updateLegend(id, { categories });
}

/** The paper box of every viewport on `sheet`: a legend's laid-out size, a drawing's fitted box. */
function takenBoxes(sheet: ProjectSheet, labels: LegendLabels): Rect[] {
  const { legends } = useProjectStore.getState();
  const env = readLegendEnv(labels);
  return (sheet.viewports ?? []).map((vp) => {
    const legend = legends?.find((l) => l.id === vp.viewId);
    const box = legend ? layoutOf(legend, env, sheet.id) : viewportBox(vp, useViewDrawings.getState().byView[vp.viewId]?.drawing?.bounds ?? null);
    return { x: vp.x - box.width / 2, y: vp.y - box.height / 2, w: box.width, h: box.height };
  });
}

/**
 * Put a legend on a sheet at its paper size, in the free place nearest the
 * bottom-right of the drawing area. Returns the viewport's id, or null when
 * the legend or the sheet is gone.
 */
export function placeLegend(sheetId: string, legendId: string, labels: LegendLabels): string | null {
  const { sheets, legends } = useProjectStore.getState();
  const sheet = sheets.find((s) => s.id === sheetId);
  const legend = legends?.find((l) => l.id === legendId);
  if (!sheet || !legend) return null;
  const size = layoutOf(legend, readLegendEnv(labels), sheetId);
  const at = freeSpot(drawingArea(sheet.paper), takenBoxes(sheet, labels), size);
  return addViewport(sheetId, legendId, { x: at.x + size.width / 2, y: at.y + size.height / 2 });
}

/**
 * After a change that can make a legend larger (a column, a category, a
 * title), pull it back inside the drawing area of every sheet it is on: its
 * box keeps its centre unless that would push it off the paper.
 */
export function keepLegendOnSheets(legendId: string, labels: LegendLabels): void {
  const { sheets, legends } = useProjectStore.getState();
  const legend = legends?.find((l) => l.id === legendId);
  if (!legend) return;
  const env = readLegendEnv(labels);
  const moved = sheets.map((sheet) => {
    if (!sheet.viewports?.some((vp) => vp.viewId === legendId)) return sheet;
    const area = drawingArea(sheet.paper);
    const { width, height } = layoutOf(legend, env, sheet.id);
    const clamp = (centre: number, from: number, length: number, size: number) => Math.min(Math.max(centre, from + size / 2), Math.max(from + size / 2, from + length - size / 2));
    return { ...sheet, viewports: sheet.viewports.map((vp) => (vp.viewId === legendId ? { ...vp, x: clamp(vp.x, area.x, area.w, width), y: clamp(vp.y, area.y, area.h, height) } : vp)) };
  });
  useProjectStore.setState({ sheets: moved, dirty: true });
}
