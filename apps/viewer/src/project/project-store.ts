/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project document store: views and sheets over the loaded models.
 *
 * Its OWN zustand store rather than a `ViewerState` slice, for the reasons
 * `savedSectionCutsStore.ts` gives: the viewer store is at its module-size
 * ratchet, and a project is a user-authored document that a model swap
 * must not tear down. The only coupling to the viewer store is one-way and
 * lives in `open-view.ts` / `project-sync.ts`.
 */

import { resolve } from '@/i18n/registry';
import { DEFAULT_JOINERY_MAPPING } from '@/joinery/symbol-mapping';
import { setSymbolLibrary } from '@/drafting/symbols';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import { knownGraphicStandard } from '@/drafting/graphic-standard';
import { relabelSectionSymbol } from '@/drafting/section-symbol';
import { settleDetailMarks } from '@/drafting/detail-mark';
import { resetWallView } from '@/wall/wall-view';
import { create } from 'zustand';
import { DEFAULT_SCHEME, nextNumber, numberGroupOf } from './numbering';
import { sheetGroupOfView, withoutAutoNumber } from './sheet-numbers';
import { findTemplate, templateFields } from './sheet-templates';
import { nextDetailNumber } from './detail';
import { upgradeTagAllTypes } from '@/tagall/types';
import { liftTypedRevisions, sheetRevisions } from './revisions';
import { carryIssueFingerprints } from './sheet-fingerprint';
import { liftSheetTitleBlocks } from './title-block';
import { warnUnknownGraphicStandard } from './graphic-standard-notice';
import { defaultViews, freshProjectId, levelsFromStoreys, syncDefaultViews, uniqueViewName, type StoreyInput } from './view-defaults';
import type { NewProjectView, ProjectViewPatch, ProjectDocument, ProjectLevel, ProjectModelRef, ProjectSheet, ProjectView, NumberGroup, NumberingScheme } from './types';
import type { UrbanSettings } from '@/urban/indicators';

export interface ProjectState extends ProjectDocument {
  /** Levels of the currently loaded models (derived, never persisted). */
  levels: ProjectLevel[];
  /** The view or sheet last opened from the navigator. */
  activeItemId: string | null;
  /** Edited since the last save to / load from a project file. */
  dirty: boolean;
}

export const DEFAULT_DRAFT_LAYER = { id: '0', name: '0', color: '#18181b', visible: true, locked: false } as const;

export const EMPTY_PROJECT: ProjectDocument = {
  name: 'Untitled project', models: [], views: [], sheets: [], titleBlock: {}, titleBlockSources: undefined, revisions: [], titleBlockParams: undefined, titleBlockTemplate: undefined, drafts: [], draftLayers: [{ ...DEFAULT_DRAFT_LAYER }], hatchPatterns: '', symbolFlips: {},
  textStyles: [{ ...DEFAULT_TEXT_STYLE }], dimStyles: [{ ...DEFAULT_DIM_STYLE }], layerGroups: [],
  joineryTypes: [], currentJoinery: {}, joineryMapping: { ...DEFAULT_JOINERY_MAPPING }, elementTypes: [], currentTypes: {}, schedules: [], structureProfiles: [], civilDrawings: [], typicalSections: [], materials: [], cadLayers: [], savedSectionCuts: [], sheetTemplates: [], seriesTemplates: {},
  annotationTypes: [], symbols: [], legends: [], details: [], issues: [], comments: [], modelState: undefined, tagFields: undefined, sheetNumbering: undefined, phaseSource: undefined, graphicStandard: undefined, siteArea: undefined, urbanSettings: undefined, scanLevels: undefined,
};

export const useProjectStore = create<ProjectState>()(() => ({
  ...EMPTY_PROJECT,
  levels: [],
  activeItemId: null,
  dirty: false,
}));

// Symbol instances look their definition up in this library (`drafting/symbols.ts`): keep it the project's.
useProjectStore.subscribe((s, previous) => {
  if (s.symbols !== previous.symbols) setSymbolLibrary(s.symbols);
});

/** Every field of the project document, once: a field added to `ProjectDocument` and not listed here does not compile. */
const DOCUMENT_FIELDS = {
  name: true, models: true, views: true, sheets: true, titleBlock: true, drafts: true, draftLayers: true, hatchPatterns: true,
  symbolFlips: true, openingLines: true, textStyles: true, dimStyles: true, layerGroups: true, joineryTypes: true, currentJoinery: true,
  schedules: true, joineryMapping: true, elementTypes: true, currentTypes: true, structureProfiles: true, civilDrawings: true,
  typicalSections: true, materials: true, savedSectionCuts: true, annotationTypes: true, symbols: true, legends: true, issues: true,
  modelState: true,
  cadLayers: true,
  details: true,
  tagFields: true,
  sheetTemplates: true,
  seriesTemplates: true,
  titleBlockSources: true,
  titleBlockParams: true,
  titleBlockTemplate: true,
  sheetNumbering: true,
  phaseSource: true,
  graphicStandard: true,
  comments: true,
  revisions: true,
  siteArea: true,
  urbanSettings: true,
  scanLevels: true,
} as const satisfies Record<keyof ProjectDocument, true>;

/**
 * The fields the project file, the autosave and the change detection all go by: `projectDocument` builds the
 * document from them and `autosave-watch.ts` saves when any of them changes, so the two cannot name different fields.
 */
export const PROJECT_DOCUMENT_KEYS = Object.keys(DOCUMENT_FIELDS) as (keyof ProjectDocument)[];

/** What a field holds when the store has none (an older file, a project not yet touched). */
const DOCUMENT_DEFAULTS: { [K in keyof ProjectDocument]?: () => ProjectDocument[K] } = {
  titleBlock: () => ({}), hatchPatterns: () => '', symbolFlips: () => ({}), openingLines: () => 'handle',
  textStyles: () => [], dimStyles: () => [], layerGroups: () => [], joineryTypes: () => [], currentJoinery: () => ({}),
  schedules: () => [], joineryMapping: () => ({ ...DEFAULT_JOINERY_MAPPING }), elementTypes: () => [], currentTypes: () => ({}),
  structureProfiles: () => [], civilDrawings: () => [], typicalSections: () => [], materials: () => [], savedSectionCuts: () => [],
  annotationTypes: () => [], symbols: () => [], legends: () => [], issues: () => [],
  cadLayers: () => [],
  details: () => [],
  sheetTemplates: () => [], seriesTemplates: () => ({}),
  comments: () => [],
  revisions: () => [],
};

/** The persisted part of the store. */
export function projectDocument(state: ProjectState = useProjectStore.getState()): ProjectDocument {
  const doc: Record<string, unknown> = {};
  for (const key of PROJECT_DOCUMENT_KEYS) {
    const value = state[key] ?? DOCUMENT_DEFAULTS[key]?.();
    if (value !== undefined) doc[key] = value;
  }
  return doc as unknown as ProjectDocument;
}

/**
 * Replace the document (file import, autosave restore). Only the document: noting a file as the last
 * one opened for these models is the caller's (`openProjectDocument` in `project-file.ts`).
 */
export function loadProjectDocument(saved: ProjectDocument, options: { dirty?: boolean } = {}): void {
  const { levels } = useProjectStore.getState();
  // Saved before the title block was the project's: each sheet's copy becomes the project's.
  // Saved when the title block's revision was typed: it becomes a revision record (`revisions.ts`). The sheets
  // print what they printed, so a sheet unchanged since the last issue still reads unchanged at the next one.
  const titled = liftSheetTitleBlocks(saved);
  const doc = carryIssueFingerprints(titled, liftTypedRevisions(titled, () => freshProjectId('revision')));
  const standard = knownGraphicStandard(doc.graphicStandard);
  resetWallView();
  useProjectStore.setState({
    ...doc,
    symbolFlips: doc.symbolFlips ?? {},
    openingLines: doc.openingLines ?? 'handle',
    textStyles: doc.textStyles?.length ? doc.textStyles : [{ ...DEFAULT_TEXT_STYLE }],
    dimStyles: doc.dimStyles?.length ? doc.dimStyles : [{ ...DEFAULT_DIM_STYLE }],
    layerGroups: doc.layerGroups ?? [],
    joineryTypes: doc.joineryTypes ?? [],
    currentJoinery: doc.currentJoinery ?? {},
    joineryMapping: doc.joineryMapping ?? { ...DEFAULT_JOINERY_MAPPING },
    elementTypes: doc.elementTypes ?? [],
    currentTypes: doc.currentTypes ?? {},
    schedules: doc.schedules ?? [],
    structureProfiles: doc.structureProfiles ?? [],
    civilDrawings: doc.civilDrawings ?? [],
    typicalSections: doc.typicalSections ?? [],
    materials: doc.materials ?? [],
    cadLayers: doc.cadLayers ?? [],
    savedSectionCuts: doc.savedSectionCuts ?? [],
    sheetTemplates: doc.sheetTemplates ?? [],
    seriesTemplates: doc.seriesTemplates ?? {},
    phaseSource: doc.phaseSource,
    // A project made before the room label read the tag name takes the new template (`tagall/types.ts`).
    annotationTypes: upgradeTagAllTypes(doc.annotationTypes ?? []),
    symbols: doc.symbols ?? [],
    legends: doc.legends ?? [],
    details: doc.details ?? [],
    issues: doc.issues ?? [],
    tagFields: doc.tagFields,
    sheetNumbering: doc.sheetNumbering,
    comments: doc.comments ?? [],
    revisions: doc.revisions ?? [],
    modelState: doc.modelState,
    titleBlockSources: doc.titleBlockSources,
    titleBlockParams: doc.titleBlockParams,
    titleBlockTemplate: doc.titleBlockTemplate,
    graphicStandard: standard.id,
    siteArea: doc.siteArea,
    urbanSettings: doc.urbanSettings,
    scanLevels: doc.scanLevels,
    draftLayers: doc.draftLayers.length > 0 ? doc.draftLayers : [{ ...DEFAULT_DRAFT_LAYER }],
    views: [...syncDefaultViews(doc.views, levels)],
    activeItemId: null,
    dirty: options.dirty ?? false,
  });
  if (standard.unknown) warnUnknownGraphicStandard(standard.unknown);
}

/**
 * Point the project at the loaded models. A project with no views yet gets
 * the default set; an existing one only gains plans for new levels.
 */
export function syncProjectWithModels(models: ProjectModelRef[], storeys: readonly StoreyInput[]): void {
  const state = useProjectStore.getState();
  const levels = levelsFromStoreys(storeys);
  const views = state.views.length === 0 ? defaultViews(levels) : syncDefaultViews(state.views, levels);
  const modelsChanged = !knowsAll(state.models, models);
  if (!modelsChanged && views === state.views && sameLevels(state.levels, levels)) return;
  useProjectStore.setState({
    levels,
    models: modelsChanged ? mergeModels(state.models, models) : state.models,
    views: views === state.views ? state.views : [...views],
    dirty: state.dirty || views !== state.views || modelsChanged,
  });
}

/** The site area in m², or null to fall back to the model's. */
export function setProjectSiteArea(area: number | null): void {
  const siteArea = area !== null && Number.isFinite(area) && area > 0 ? area : undefined;
  if (siteArea !== useProjectStore.getState().siteArea) useProjectStore.setState({ siteArea, dirty: true });
}

/** Change the urban indicators' settings; a field set to undefined goes back to its default. */
export function setUrbanSettings(patch: Partial<UrbanSettings>): void {
  const merged: UrbanSettings = { ...useProjectStore.getState().urbanSettings, ...patch };
  for (const key of Object.keys(merged) as (keyof UrbanSettings)[]) if (merged[key] === undefined) delete merged[key];
  useProjectStore.setState({ urbanSettings: Object.keys(merged).length ? merged : undefined, dirty: true });
}

export function resetProject(): void {
  resetWallView();
  useProjectStore.setState({ ...EMPTY_PROJECT, name: resolve('names.project.untitled'), activeItemId: null, dirty: false });
}

export function setProjectName(name: string): void {
  const trimmed = name.trim();
  if (trimmed) useProjectStore.setState({ name: trimmed, dirty: true });
}

/** Toggle plan symbol flips (`ProjectDocument.symbolFlips` bits) on the elements `globalIds` name. */
export function toggleSymbolFlips(globalIds: readonly string[], bit: 1 | 2): void {
  if (globalIds.length === 0) return;
  const flips = { ...useProjectStore.getState().symbolFlips };
  for (const id of globalIds) {
    const next = (flips[id] ?? 0) ^ bit;
    if (next) flips[id] = next;
    else delete flips[id];
  }
  useProjectStore.setState({ symbolFlips: flips, dirty: true });
}

export function setActiveProjectItem(id: string | null): void {
  useProjectStore.setState({ activeItemId: id });
}

export function addProjectView(view: NewProjectView): string {
  const state = useProjectStore.getState();
  const id = view.id ?? freshProjectId('view');
  const created = { ...view, id, name: uniqueViewName(view.name, state.views), createdAt: Date.now() } as ProjectView;
  useProjectStore.setState({ views: [...state.views, created], dirty: true });
  return id;
}

export function renameProjectItem(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const state = useProjectStore.getState();
  if (state.views.some((v) => v.id === id)) {
    const others = state.views.filter((v) => v.id !== id);
    const unique = uniqueViewName(trimmed, others);
    const renamed = state.views.find((v) => v.id === id);
    // A section's symbols on its plans show its name.
    const drafts = renamed?.kind === 'section' ? relabelSectionSymbol(state.drafts, id, unique) : state.drafts;
    useProjectStore.setState({ views: state.views.map((v) => (v.id === id ? { ...v, name: unique } : v)), drafts, dirty: true });
    return;
  }
  if (state.schedules?.some((s) => s.id === id)) {
    useProjectStore.setState({ schedules: state.schedules.map((s) => (s.id === id ? { ...s, name: trimmed } : s)), dirty: true });
    return;
  }
  if (state.legends?.some((l) => l.id === id)) {
    useProjectStore.setState({ legends: state.legends.map((l) => (l.id === id ? { ...l, name: trimmed } : l)), dirty: true });
    return;
  }
  if (state.civilDrawings?.some((d) => d.id === id)) {
    useProjectStore.setState({ civilDrawings: state.civilDrawings.map((d) => (d.id === id ? { ...d, name: trimmed } : d)), dirty: true });
    return;
  }
  useProjectStore.setState({ sheets: state.sheets.map((s) => (s.id === id ? { ...s, name: trimmed } : s)), dirty: true });
}

/** Change a view's settings (cut height, view depth, section plane…). Its id and kind never change. */
export function updateProjectView(id: string, patch: ProjectViewPatch): void {
  const state = useProjectStore.getState();
  if (!state.views.some((v) => v.id === id)) return;
  useProjectStore.setState({
    views: state.views.map((v) => (v.id === id ? ({ ...v, ...patch, id: v.id, kind: v.kind } as ProjectView) : v)),
    dirty: true,
  });
}

export function duplicateProjectView(id: string): string | null {
  const state = useProjectStore.getState();
  const source = state.views.find((v) => v.id === id);
  if (!source) return null;
  const clone = structuredClone(source);
  // A detail number names one detail: a copied drafting view takes one when a mark is made for it, a copied area detail the next free one.
  if (clone.kind === 'drafting') delete clone.number;
  if (clone.detail) clone.detail = { ...clone.detail, number: nextDetailNumber(state.views) };
  const copy = { ...clone, id: freshProjectId('view'), name: uniqueViewName(`${source.name} Copy`, state.views), auto: false, createdAt: Date.now() };
  const at = state.views.indexOf(source) + 1;
  useProjectStore.setState({ views: [...state.views.slice(0, at), copy, ...state.views.slice(at)], dirty: true });
  return copy.id;
}

export function removeProjectItem(id: string): void {
  const state = useProjectStore.getState();
  useProjectStore.setState({
    views: state.views.filter((v) => v.id !== id),
    // A deleted legend leaves the sheets it was placed on.
    sheets: state.sheets.filter((s) => s.id !== id).map((s) => (state.legends?.some((l) => l.id === id) && s.viewports?.some((vp) => vp.viewId === id) ? { ...s, viewports: s.viewports.filter((vp) => vp.viewId !== id) } : s)),
    schedules: (state.schedules ?? []).filter((s) => s.id !== id),
    civilDrawings: (state.civilDrawings ?? []).filter((d) => d.id !== id),
    legends: (state.legends ?? []).filter((l) => l.id !== id),
    // A deleted sheet takes the comments pinned on it.
    comments: (state.comments ?? []).some((c) => c.sheetId === id) ? (state.comments ?? []).filter((c) => c.sheetId !== id) : state.comments,
    // A deleted view takes its own drawing with it, a section's symbol on its plans and a detail's mark on its source.
    drafts: state.drafts.some((d) => d.viewId === id || d.params.sectionOf === id || d.params.detailOf === id) ? state.drafts.filter((d) => d.viewId !== id && d.params.sectionOf !== id && d.params.detailOf !== id) : state.drafts,
    activeItemId: state.activeItemId === id ? null : state.activeItemId,
    dirty: true,
  });
}

/** The project's numbering scheme: its own, else today's A-101 style. */
export const numberingScheme = (state: Pick<ProjectDocument, 'sheetNumbering'> = useProjectStore.getState()): NumberingScheme => state.sheetNumbering ?? DEFAULT_SCHEME;

/**
 * A new sheet takes the next number of `group`. Without a group it takes the
 * next plan number until a view is placed on it, then it is numbered by what
 * it holds. It starts from the template if one is named.
 */
export function addProjectSheet(name = 'Unnamed', group?: NumberGroup, templateId?: string): string {
  const state = useProjectStore.getState();
  const series = group ?? 'plans';
  const template = findTemplate(templateId, state.sheetTemplates);
  const sheet: ProjectSheet = { id: freshProjectId('sheet'), number: nextNumber(state.sheets, series, numberingScheme(state)), series, ...(group ? {} : { autoNumber: true }), name, createdAt: Date.now(), ...(template ? templateFields(template) : {}) };
  useProjectStore.setState({ sheets: [...state.sheets, sheet], dirty: true });
  return sheet.id;
}

/** Copy a sheet under the next free number, right after it. */
export function duplicateProjectSheet(id: string): string | null {
  const state = useProjectStore.getState();
  const source = state.sheets.find((s) => s.id === id);
  if (!source) return null;
  const held = state.views.find((v) => v.id === source.viewports?.[0]?.viewId);
  const series = sheetGroupOfView(held);
  const { numberOverride: _typed, ...own } = withoutAutoNumber(source);
  // The copy has a new id, so clouds drawn on the source sheet do not name its revisions: it chooses them itself.
  const copy: ProjectSheet = { ...own, id: freshProjectId('sheet'), number: nextNumber(state.sheets, series, numberingScheme(state)), series, name: `${source.name} Copy`, createdAt: Date.now(), revisionIds: sheetRevisions(source, state).map((r) => r.id) };
  const at = state.sheets.indexOf(source) + 1;
  useProjectStore.setState({ sheets: [...state.sheets.slice(0, at), copy, ...state.sheets.slice(at)], dirty: true });
  return copy.id;
}

export function setSheetNumber(id: string, number: string): void {
  const trimmed = number.trim();
  if (!trimmed) return;
  useProjectStore.setState((s) => ({ sheets: s.sheets.map((sh) => (sh.id === id ? { ...withoutAutoNumber(sh), number: trimmed, series: numberGroupOf(sh), numberOverride: true } : sh)), dirty: true }));
}

/** Whether every loaded model is already in the project's model list. */
function knowsAll(known: readonly ProjectModelRef[], loaded: readonly ProjectModelRef[]): boolean {
  return loaded.every((m) => known.some((k) => k.key === m.key));
}

/** Keep models the project already knew (a file may name models not loaded yet), add new ones. */
function mergeModels(known: readonly ProjectModelRef[], loaded: readonly ProjectModelRef[]): ProjectModelRef[] {
  const merged = [...known];
  for (const model of loaded) if (!merged.some((m) => m.key === model.key)) merged.push(model);
  return merged;
}

function sameLevels(a: readonly ProjectLevel[], b: readonly ProjectLevel[]): boolean {
  return a.length === b.length && a.every((l, i) => l.name === b[i].name && l.elevation === b[i].elevation && l.floorY === b[i].floorY);
}

// A detail mark's label is the detail's drawing number on its sheet and that sheet's number: derived, so it follows
// a sheet's renumbering or the detail's placement without anyone editing the text.
useProjectStore.subscribe((state, previous) => {
  if (state.sheets === previous.sheets && state.views === previous.views && state.drafts === previous.drafts) return;
  const settled = settleDetailMarks(state.drafts, state.views, state.sheets);
  if (settled !== state.drafts) useProjectStore.setState({ drafts: settled });
});
