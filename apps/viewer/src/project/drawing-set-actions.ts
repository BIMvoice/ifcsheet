/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the Wall does to the project: make the drawing set whole (the starting
 * set when a model opens on an empty project, and the DRAFTSET command),
 * change the scale of a group of sheets, swap the view in a sheet's slot for
 * another proposed section. Each is one store
 * write over `drawing-set.ts`'s pure layout.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { createProposedSection } from '@/drafting/section-create';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { AxisBounds } from '@/lib/section/section-distance';
import { useViewerStore } from '@/store';
import { buildDrawingSet, drawingArea, groupsThatDoNotFit, nextInSeries, rowOfViewports, SET_PAPER, sheetGroup, viewExtent, withViewHung, type ModelExtent, type Reason, type SetGroup } from './drawing-set';
import { addSchedule } from '@/joinery/schedules';
import { proposalInputForLevel } from './model-rooms';
import { addProjectView, updateProjectView, useProjectStore } from './project-store';
import { elevationDepth, elevationPlaneOffset, proposalDepth } from './set-defaults';
import { seedProjectTitleBlock } from './sheets';
import { DEFAULT_PLAN_CUT_HEIGHT_M, ELEVATION_DIRECTIONS, freshProjectId, sameElevation } from './view-defaults';
import { proposeSections, type SectionProposal } from './section-proposals';
import type { ElevationDirection, PlanProjectView, ProjectLevel, ProjectSchedule, ProjectSheet, ProjectView, SectionProjectView } from './types';

/** How many proposed sections the starting set draws; the rest wait in the tray. */
export const SET_SECTIONS = 2;

/** Title block fields the model can fill: the project's name and today's date. */
export function modelTitleBlock(now = new Date()): Record<string, string> {
  const fields: Record<string, string> = { date: now.toISOString().slice(0, 10) };
  for (const model of useViewerStore.getState().models.values()) {
    const project = model.ifcDataStore?.spatialHierarchy?.project;
    const name = project?.longName || project?.name;
    if (name) {
      fields.project = name;
      break;
    }
  }
  return fields;
}

/** The lowest plan: the one a set's sections are drawn on. */
export function groundPlan(views: readonly ProjectView[]): PlanProjectView | null {
  const plans = views.filter((v): v is PlanProjectView => v.kind === 'plan');
  return plans.sort((a, b) => a.level.elevation - b.level.elevation)[0] ?? null;
}

/** The sections the model suggests, cut on its lowest plan. Empty until the geometry is there. */
export function sectionProposals(meshes: MeshData[] | null, bounds: AxisBounds | null): SectionProposal[] {
  const plan = groundPlan(useProjectStore.getState().views);
  const input = plan ? proposalInputForLevel(plan.level, meshes, bounds) : null;
  return input ? proposeSections(input) : [];
}

/** The section already made for `proposal`, else a new one on the lowest plan. */
export function sectionForProposal(proposal: SectionProposal): string | null {
  const { views, levels } = useProjectStore.getState();
  const existing = views.find((v): v is SectionProjectView => v.kind === 'section' && v.through === proposal.label);
  if (existing) return existing.id;
  const plan = groundPlan(views);
  return plan ? createProposedSection(plan, levels, proposal) : null;
}

/**
 * Lay out the starting set on a project that has no sheets yet. Returns
 * whether it did; a project with sheets is never touched.
 */
export function startDrawingSet(meshes: MeshData[] | null, bounds: AxisBounds | null): boolean {
  if (!bounds || useProjectStore.getState().sheets.length > 0) return false;
  return ensureDrawingSet(meshes, bounds, { onOpen: true }).sheetsAdded > 0;
}

// ---- Make the set whole (the one planner behind the Wall's start and DRAFTSET) ----

const state = () => useProjectStore.getState();

export interface EnsureReport {
  viewsAdded: number;
  viewsExisting: number;
  sheetsAdded: number;
  sheetsExisting: number;
  /** Numbers of the sheets added. */
  addedSheetNumbers: string[];
  /** Things the person should know: no storeys, a group that does not fit its paper. */
  notes: Reason[];
}

export interface EnsureOptions {
  /** On open: a project that already has sections is not given proposed ones. */
  onOpen?: boolean;
}

const ELEVATION_NAMES: Record<ElevationDirection, string> = { north: 'North Elevation', east: 'East Elevation', south: 'South Elevation', west: 'West Elevation' };


/** One plan per storey that has none yet; a model with no storeys gets one cut at mid-height. */
function ensurePlans(extent: AxisBounds, report: EnsureReport): void {
  const levels: ProjectLevel[] = [];
  for (const level of [...state().levels].sort((a, b) => a.elevation - b.elevation)) {
    if (!levels.some((l) => sameElevation(l.elevation, level.elevation))) levels.push(level);
  }
  if (levels.length === 0) {
    if (state().views.some((v) => v.kind === 'plan')) return;
    const height = Math.round(((extent.max.y - extent.min.y) / 2) * 10) / 10;
    report.notes.push({ key: 'draftSet.note.noStoreys', params: { height } });
    addProjectView({ kind: 'plan', name: 'Plan', cutHeight: height, level: { name: 'Plan', elevation: extent.min.y, storeyGlobalIds: [] } });
    report.viewsAdded++;
    return;
  }
  for (const level of levels) {
    if (state().views.some((v) => v.kind === 'plan' && sameElevation(v.level.elevation, level.elevation))) {
      report.viewsExisting++;
      continue;
    }
    addProjectView({ kind: 'plan', name: level.name, cutHeight: DEFAULT_PLAN_CUT_HEIGHT_M, level: { name: level.name, elevation: level.elevation, storeyGlobalIds: [...level.storeyGlobalIds] } });
    report.viewsAdded++;
  }
}

/** The four elevations, each plane just inside its facade and each seeing through the building; a depth or plane already set stays. */
function ensureElevations(extent: AxisBounds, report: EnsureReport): void {
  for (const direction of ELEVATION_DIRECTIONS) {
    const found = state().views.find((v) => v.kind === 'elevation' && v.direction === direction);
    if (!found) {
      addProjectView({ kind: 'elevation', name: ELEVATION_NAMES[direction], direction, planeOffset: elevationPlaneOffset(direction, extent), viewDepth: elevationDepth(direction, extent) });
      report.viewsAdded++;
      continue;
    }
    report.viewsExisting++;
    if (found.kind !== 'elevation') continue;
    if (found.viewDepth == null) updateProjectView(found.id, { viewDepth: elevationDepth(direction, extent) });
    if (found.planeOffset === undefined) updateProjectView(found.id, { planeOffset: elevationPlaneOffset(direction, extent) });
  }
}

/** The sections the starting set draws, made if missing; one with no depth of its own sees to the far side of the building. */
function ensureSections(meshes: MeshData[] | null, extent: AxisBounds, options: EnsureOptions, report: EnsureReport): void {
  if (options.onOpen && state().views.some((v) => v.kind === 'section')) return;
  for (const proposal of sectionProposals(meshes, extent).slice(0, SET_SECTIONS)) {
    const had = state().views.some((v) => v.kind === 'section' && v.through === proposal.label);
    const id = sectionForProposal(proposal);
    if (!id) continue;
    if (had) report.viewsExisting++;
    else report.viewsAdded++;
    if (state().views.find((v) => v.id === id)?.viewDepth == null) updateProjectView(id, { viewDepth: proposalDepth(proposal, extent) });
  }
}

/** A plan with no scale of its own takes the one it is drawn at on its sheet, so what is drawn on it is sized for that scale. */
function ensurePlanScales(extent: AxisBounds): void {
  const plans = state().views.filter((v): v is PlanProjectView => v.kind === 'plan' && !v.detail);
  const onSheet = new Map(state().sheets.flatMap((s) => (s.viewports ?? []).map((vp) => [vp.viewId, vp.scale] as const)));
  const planned = state().sheets.length === 0 ? buildDrawingSet({ views: plans, extent }) : [];
  const plannedScale = new Map(planned.flatMap((s) => (s.viewports ?? []).map((vp) => [vp.viewId, vp.scale] as const)));
  for (const plan of plans) {
    const scale = onSheet.get(plan.id) ?? plannedScale.get(plan.id);
    if (scale !== undefined && plan.scale === undefined && !state().drafts.some((d) => d.viewId === plan.id)) updateProjectView(plan.id, { scale });
  }
}

/** Every drawing not on a sheet yet, hung where it belongs. */
function ensureSheets(extent: AxisBounds, report: EnsureReport): void {
  const hung = new Set(state().sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const loose = state().views.filter((v) => !hung.has(v.id));
  const before = state().sheets;
  report.sheetsExisting = before.length;
  let sheets = before;
  if (before.length === 0) {
    sheets = buildDrawingSet({ views: loose, extent });
  } else {
    for (const view of loose) {
      const next = withViewHung(sheets, state().views, view, extent);
      if (next) sheets = next.sheets;
    }
  }
  if (sheets === before) return;
  useProjectStore.setState({ sheets, dirty: true });
  // The title block is the project's, filled once: the model's name and today's date where the project has none.
  seedProjectTitleBlock(modelTitleBlock());
  const known = new Set(before.map((s) => s.id));
  const added = sheets.filter((s) => !known.has(s.id));
  report.sheetsAdded = added.length;
  report.addedSheetNumbers = added.map((s) => s.number);
}

/**
 * Make the set whole for a building of `extent`, as one undo step. `meshes`
 * are the model's, for the rooms and the stair the sections pass through.
 */
export function ensureDrawingSet(meshes: MeshData[] | null, extent: AxisBounds, options: EnsureOptions = {}): EnsureReport {
  const report: EnsureReport = { viewsAdded: 0, viewsExisting: 0, sheetsAdded: 0, sheetsExisting: 0, addedSheetNumbers: [], notes: [] };
  runAsOneUndoStep(() => {
    ensurePlans(extent, report);
    ensureElevations(extent, report);
    ensurePlanScales(extent);
    ensureSections(meshes, extent, options, report);
    ensureSheets(extent, report);
  });
  for (const group of groupsThatDoNotFit(state().views, extent)) report.notes.push({ key: 'draftSet.note.noFit', params: { kind: group } });
  return report;
}

/** Lay every sheet of `group` out again at `scale`. */
export function setGroupScale(group: SetGroup, scale: number, extent: ModelExtent): void {
  const { sheets, views } = useProjectStore.getState();
  useProjectStore.setState({
    sheets: sheets.map((sheet) => {
      if (sheetGroup(sheet) !== group) return sheet;
      const members = (sheet.viewports ?? []).flatMap((vp) => views.find((v) => v.id === vp.viewId) ?? []);
      const sizes = members.map((v) => viewExtent(v, extent));
      return { ...sheet, viewports: rowOfViewports(members, sizes, scale, sheet.paper) };
    }),
    dirty: true,
  });
}

/** The scale the sheets of `group` are drawn at, when they all share one. */
export function groupScale(group: SetGroup, sheets: readonly ProjectSheet[] = useProjectStore.getState().sheets): number | null {
  const scales = new Set(sheets.filter((s) => sheetGroup(s) === group).flatMap((s) => (s.viewports ?? []).map((v) => v.scale)));
  return scales.size === 1 ? [...scales][0] : null;
}

/** Show `viewId` in the slot of `viewportId`, keeping the slot's place and scale. */
export function swapViewportView(sheetId: string, viewportId: string, viewId: string): void {
  const { sheets } = useProjectStore.getState();
  useProjectStore.setState({
    sheets: sheets.map((s) => (s.id !== sheetId ? s : { ...s, viewports: (s.viewports ?? []).map((v) => (v.id === viewportId ? { ...v, viewId, width: 0, height: 0, center: null } : v)) })),
    dirty: true,
  });
}

/** Hang `viewId` on the set (`withViewHung`); returns the sheet it went on, or null when it already hangs or cannot. */
export function hangView(viewId: string, extent: ModelExtent): string | null {
  const { sheets, views } = useProjectStore.getState();
  const view = views.find((v) => v.id === viewId);
  const hung = view ? withViewHung(sheets, views, view, extent) : null;
  if (!hung) return null;
  useProjectStore.setState({ sheets: hung.sheets, dirty: true });
  return hung.sheetId;
}

/** Hang a schedule or a legend on a sheet of its own in the A-6xx series: `itemId` centred in the drawing area, the sheet named `name`. */
function hangOnSheetOfItsOwn(itemId: string, name: string): string {
  const { sheets } = useProjectStore.getState();
  const placed = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === itemId));
  if (placed) return placed.id;
  const area = drawingArea(SET_PAPER);
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: nextInSeries(sheets, 'schedules'), name, createdAt: Date.now(), paper: SET_PAPER, orientation: 'landscape',
    viewports: [{ id: freshProjectId('viewport'), viewId: itemId, x: area.x + area.w / 2, y: area.y + area.h / 2, scale: 50, width: 0, height: 0, center: null }],
  };
  useProjectStore.setState({ sheets: [...sheets, sheet], dirty: true });
  return sheet.id;
}

/**
 * Hang a schedule (doors and windows, or the material takeoff) on a sheet of
 * its own in the A-6xx series, its table centred in the drawing area, named
 * after it. Returns the sheet's id; a schedule already on a sheet returns
 * that sheet.
 */
export function hangSchedule(scheduleId: string): string | null {
  const schedule = useProjectStore.getState().schedules?.find((s) => s.id === scheduleId);
  return schedule ? hangOnSheetOfItsOwn(scheduleId, schedule.name) : null;
}

/** Hang a legend the same way (`hangSchedule`); a legend already on a sheet returns that sheet. */
export function hangLegend(legendId: string): string | null {
  const legend = useProjectStore.getState().legends?.find((l) => l.id === legendId);
  return legend ? hangOnSheetOfItsOwn(legendId, legend.name) : null;
}

/** A new schedule hung on the set (`hangSchedule`); returns its sheet. */
export function addScheduleToSet(kind: ProjectSchedule['kind'], name: string): string {
  const id = hangSchedule(addSchedule(kind, name));
  if (!id) throw new Error('a schedule just added was not found');
  return id;
}
