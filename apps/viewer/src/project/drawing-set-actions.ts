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
import { buildDrawingSet, drawingArea, groundPlan, groupsThatDoNotFit, isSetSheet, placeViewports, SET_PAPER, sheetGroup, viewExtent, withViewHung, type ModelExtent, type Reason, type SetGroup } from './drawing-set';
import { findTemplate, templateFields } from './sheet-templates';
import { paperLabel } from './paper';
import { addSchedule } from '@/joinery/schedules';
import { registerHolders, registerSheetFit } from './drawing-register';
import { proposalInputForLevel } from './model-rooms';
import { DEFAULT_SCHEME, nextNumber, numberSheets, registerNumberIn } from './numbering';
import { addProjectView, EMPTY_PROJECT, numberingScheme, updateProjectView, useProjectStore } from './project-store';
import { elevationDepth, elevationPlaneOffset, proposalDepth } from './set-defaults';
import { seedProjectTitleBlock } from './sheets';
import { resolve } from '@/i18n/registry';
import { DEFAULT_PLAN_CUT_HEIGHT_M, ELEVATION_DIRECTIONS, elevationName, freshProjectId, sameElevation } from './view-defaults';
import { proposeSections, type SectionProposal } from './section-proposals';
import { ensureScanPlans, ensureScanSections, isScanPlan } from './scan-set';
import type { ScanLevel } from '@/scan/scan-levels';
import type { PlanProjectView, ProjectLevel, ProjectSchedule, ProjectSheet, ProjectView, SectionProjectView, SheetTemplate, TemplateSeries } from './types';

// The lowest plan lives with the set's pure layout (`drawing-set.ts`), so the drafting marks can read it without this module's store.
export { groundPlan } from './drawing-set';

/** How many proposed sections the starting set draws; the rest wait in the tray. */
export const SET_SECTIONS = 2;

/**
 * Title block fields typed for the project when a set is laid out: today's date.
 * The project's name, address and organisation are not copied in; every sheet
 * reads them from the model (`title-block-model.ts`) until someone types over them.
 */
export function modelTitleBlock(now = new Date()): Record<string, string> {
  return { date: now.toISOString().slice(0, 10) };
}

/**
 * The new set's sheets renumbered around the sheets already there (a room's
 * interior elevations, made first), so a continuous scheme does not give a
 * set sheet a number one of them already has.
 */
function withoutClashes(existing: readonly ProjectSheet[], set: readonly ProjectSheet[]): ProjectSheet[] {
  if (existing.length === 0) return [...set];
  const numbers = numberSheets([...existing.map((s) => ({ ...s, numberOverride: true })), ...set], numberingScheme());
  return set.map((s) => ({ ...s, number: numbers.get(s.id) ?? s.number }));
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
 * Lay out the starting set on a project that has no set sheets yet (a room's
 * interior elevations, made first, do not count). Returns whether it did; a
 * project with set sheets is never touched.
 */
export function startDrawingSet(meshes: MeshData[] | null, bounds: AxisBounds | null, options: Omit<EnsureOptions, 'onOpen'> = {}): boolean {
  if (!bounds || useProjectStore.getState().sheets.some(isSetSheet)) return false;
  // A project still carrying the untouched English default name takes the active language's, once, as it is started.
  const { name, dirty } = useProjectStore.getState();
  const untitled = resolve('names.project.untitled');
  if (!dirty && name === EMPTY_PROJECT.name && untitled !== name) useProjectStore.setState({ name: untitled });
  return ensureDrawingSet(meshes, bounds, { ...options, onOpen: true }).sheetsAdded > 0;
}

// ---- Make the set whole (the one planner behind the Wall's start and DRAFTSET) ----

const state = () => useProjectStore.getState();

/** The template each series of the set starts its new sheets from, as the project chose; a series without one is absent. */
export function seriesTemplates(): Partial<Record<TemplateSeries, SheetTemplate>> {
  const { seriesTemplates: chosen = {}, sheetTemplates = [] } = state();
  return Object.fromEntries(Object.entries(chosen).flatMap(([series, id]) => { const t = findTemplate(id, sheetTemplates); return t ? [[series, t]] : []; }));
}

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
  /** A scan, not a model (#181): plans at its levels and sections across it (`scan-set.ts`), no elevations. */
  scan?: { levels: readonly ScanLevel[]; centre?: { x: number; z: number } | null };
}


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
    addProjectView({ kind: 'plan', name: resolve('names.view.plan'), cutHeight: height, level: { name: resolve('names.view.plan'), elevation: extent.min.y, storeyGlobalIds: [] } });
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
    const found = state().views.find((v) => v.kind === 'elevation' && v.direction === direction && !v.interior);
    if (!found) {
      addProjectView({ kind: 'elevation', name: elevationName(direction), direction, planeOffset: elevationPlaneOffset(direction, extent), viewDepth: elevationDepth(direction, extent) });
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
  const planned = state().sheets.some(isSetSheet) ? [] : buildDrawingSet({ views: plans, extent, templates: seriesTemplates() });
  const plannedScale = new Map(planned.flatMap((s) => (s.viewports ?? []).map((vp) => [vp.viewId, vp.scale] as const)));
  for (const plan of plans) {
    const scale = onSheet.get(plan.id) ?? plannedScale.get(plan.id);
    if (scale !== undefined && plan.scale === undefined && !state().drafts.some((d) => d.viewId === plan.id)) updateProjectView(plan.id, { scale });
  }
}

/** Every drawing not on a sheet yet, hung where it belongs. */
function ensureSheets(extent: AxisBounds, report: EnsureReport, hangs: (view: ProjectView) => boolean = () => true): void {
  const hung = new Set(state().sheets.flatMap((s) => (s.viewports ?? []).map((vp) => vp.viewId)));
  const loose = state().views.filter((v) => !hung.has(v.id) && hangs(v));
  const before = state().sheets;
  report.sheetsExisting = before.length;
  let sheets = before;
  if (!before.some(isSetSheet)) {
    // No set yet: lay it all out, beside any interior elevation sheets already there.
    const set = withoutClashes(before, buildDrawingSet({ views: loose, extent, templates: seriesTemplates(), scheme: numberingScheme() }));
    if (set.length > 0) sheets = [...before, ...set];
  } else {
    for (const view of loose) {
      const next = withViewHung(sheets, state().views, view, extent, Date.now(), seriesTemplates(), numberingScheme());
      if (next) sheets = next.sheets;
    }
  }
  if (sheets === before) return;
  useProjectStore.setState({ sheets, dirty: true });
  // The title block is the project's, filled once: today's date where the project has none.
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
    if (options.scan) {
      const plans = ensureScanPlans(options.scan.levels);
      const sections = ensureScanSections(options.scan.levels, extent, options.onOpen === true, options.scan.centre);
      report.viewsAdded += plans.added.length + sections.added;
      report.viewsExisting += plans.existing + sections.existing;
      ensurePlanScales(extent);
      ensureSheets(extent, report, (v) => isScanPlan(v) || v.kind === 'section');
      return;
    }
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
      return { ...sheet, viewports: placeViewports(members, sizes, scale, sheet) };
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
  const hung = view ? withViewHung(sheets, views, view, extent, Date.now(), seriesTemplates(), numberingScheme()) : null;
  if (!hung) return null;
  useProjectStore.setState({ sheets: hung.sheets, dirty: true });
  return hung.sheetId;
}

/** Hang a schedule or a legend on a sheet of its own in the A-6xx series: `itemId` centred in the drawing area, the sheet named `name`. */
function hangOnSheetOfItsOwn(itemId: string, name: string): string {
  const { sheets } = useProjectStore.getState();
  const placed = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === itemId));
  if (placed) return placed.id;
  const template = seriesTemplates().schedules;
  const start = template ? templateFields(template) : { paper: SET_PAPER, orientation: 'landscape' as const };
  const area = drawingArea(start);
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: nextNumber(sheets, 'schedules', numberingScheme()), series: 'schedules', name, createdAt: Date.now(), ...start,
    viewports: [{ id: freshProjectId('viewport'), viewId: itemId, x: area.x + area.w / 2, y: area.y + area.h / 2, scale: 50, width: 0, height: 0, center: null }],
  };
  useProjectStore.setState({ sheets: [...sheets, sheet], dirty: true });
  return sheet.id;
}

/**
 * Hang a schedule (doors and windows, or the material takeoff) on a sheet of
 * its own in the schedules series (A-6xx by default), its table centred in the drawing area, named
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

export { setSheetFormat, type SheetFormatPatch } from './sheet-format-actions';
/** The register's number under the project's scheme: its slot before the general series (A-000, A00 in a sequential scheme) while free, else the first free number of the general series (`registerNumberIn`). */
export function registerNumber(sheets: readonly Pick<ProjectSheet, 'number'>[], scheme = DEFAULT_SCHEME): string {
  return registerNumberIn(sheets, scheme);
}

/**
 * The drawing register on a sheet of its own, numbered A-000 (`registerNumber`), its table at the top left of the
 * drawing area. It holds no rows: they are read from the sheets whenever it is drawn. A register already on a
 * sheet returns that sheet.
 */
export function addRegisterToSet(name: string): string {
  const { sheets, schedules } = useProjectStore.getState();
  const existing = schedules?.find((s) => s.kind === 'register');
  const placed = existing && sheets.find((sh) => (sh.viewports ?? []).some((vp) => vp.viewId === existing.id));
  if (placed) return placed.id;
  const scheduleId = existing?.id ?? addSchedule('register', name);
  const area = drawingArea(SET_PAPER);
  const sheet: ProjectSheet = {
    id: freshProjectId('sheet'), number: registerNumber(sheets, numberingScheme()), series: 'general', name, createdAt: Date.now(), paper: SET_PAPER, orientation: 'landscape',
    viewports: [{ id: freshProjectId('viewport'), viewId: scheduleId, x: area.x + area.w / 2, y: area.y + area.h / 2, scale: 1, width: 0, height: 0, center: null }],
  };
  useProjectStore.setState({ sheets: [...useProjectStore.getState().sheets, sheet], dirty: true });
  syncRegisterPages();
  return sheet.id;
}

/**
 * The register's sheets, its own first and then its continuation sheets by
 * page: as many as `registerSheetFit` needs for a row per sheet of the set, the
 * continuation sheets counted. A continuation sheet is numbered after the
 * register's own (A-000.1, A-000.2…, skipping a number another sheet has) and
 * holds the register's next page; one no longer needed is removed. Runs
 * whenever the sheets change, so the register never runs off its paper.
 */
export function syncRegisterPages(): void {
  const { sheets, schedules } = useProjectStore.getState();
  const register = schedules?.find((s) => s.kind === 'register');
  if (!register) return;
  const pageOf = (s: ProjectSheet) => (s.viewports ?? []).find((vp) => vp.viewId === register.id)?.page ?? 0;
  const holders = registerHolders(sheets, register.id);
  const first = holders[0];
  if (!first) return;
  const others = sheets.length - holders.length;
  // Each continuation sheet is a row of the register too: settle on a count that holds itself.
  let pages = 1;
  for (let i = 0; i < 8; i++) {
    const need = registerSheetFit(others + pages, sheets, register.id).pages;
    if (need === pages) break;
    pages = need;
  }
  const keep = holders.slice(0, pages);
  const gone = new Set(holders.slice(pages).map((s) => s.id));
  const taken = new Set(sheets.filter((s) => !gone.has(s.id)).map((s) => s.number));
  const added: ProjectSheet[] = [];
  for (let page = keep.length; page < pages; page++) {
    let n = page;
    while (taken.has(`${first.number}.${n}`)) n++;
    const number = `${first.number}.${n}`;
    taken.add(number);
    const vp = (first.viewports ?? []).find((v) => v.viewId === register.id);
    added.push({
      id: freshProjectId('sheet'), number, series: 'general', name: first.name, createdAt: Date.now(), paper: first.paper, orientation: first.orientation,
      viewports: [{ ...(vp ?? { x: 0, y: 0, scale: 1, width: 0, height: 0, center: null }), id: freshProjectId('viewport'), viewId: register.id, page }],
    });
  }
  // A continuation sheet removed by hand leaves a gap: the ones kept show pages 0, 1, 2… in order.
  // Every page is fitted to the first sheet's paper (`registerSheetFit`): a continuation sheet takes that paper too, so its page stays on it.
  const renumbered = new Map(keep.flatMap((s, i) => (pageOf(s) === i && (i === 0 || (paperLabel(s.paper ?? SET_PAPER) === paperLabel(first.paper ?? SET_PAPER) && s.orientation === first.orientation)) ? [] : [[s.id, {
    ...s, ...(i === 0 ? {} : { paper: first.paper, orientation: first.orientation }),
    viewports: (s.viewports ?? []).map((vp) => (vp.viewId !== register.id ? vp : i === 0 ? (({ page: _p, ...rest }) => rest)(vp) : { ...vp, page: i })),
  }] as const])));
  if (added.length === 0 && gone.size === 0 && renumbered.size === 0) return;
  useProjectStore.setState({ sheets: [...sheets.filter((s) => !gone.has(s.id)).map((s) => renumbered.get(s.id) ?? s), ...added], dirty: true });
}

// The register follows the set: a sheet added or removed may need a page more or less.
useProjectStore.subscribe((state, previous) => {
  if (state.sheets !== previous.sheets || state.schedules !== previous.schedules) syncRegisterPages();
});
