/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `.ifclite-project.json` sidecar: a project's views and sheets, saved
 * next to the IFC files it refers to (by content hash, else by name). The
 * IFC files themselves are never written. Parsing validates every view so a
 * hand-edited or truncated file fails loudly instead of half-loading.
 */

import { resolve } from '@/i18n/registry';
import { readJoineryMapping } from '@/joinery/symbol-mapping';
import { downloadFile, sanitizeFilename } from '@/lib/export/download.js';
import { readDraft, readDraftLayer } from '@/drafting/draft-file';
import { readAnnotationType, readLegend, readList, readSymbol } from '@/catalogue/readers';
import { readNumberingScheme } from './numbering';
import { readLibraryDetail } from '@/catalogue/detail-reader';
import { readCadLayerRule } from './cad-layers-file';
import { readSheetLayout, readTitleBlock } from './sheet-file';
import { readTitleBlockParams, readTitleBlockTemplate } from './title-block-file';
import { readSeriesTemplates, readTemplate } from './sheet-templates';
import { read3dPrint } from './view-3d-file';
import { readIssues } from '@/issue/file';
import { readRevisions } from './revision-file';
import { readComments } from '@/review/file';
import { readTitleSources } from './title-block-sources';
import { readStandards } from './standards-file';
import { isDisciplineId } from './discipline-views';
import { readSnapshot } from '@/whatchanged/snapshot-file';
import { declaredVersion, migrateProject, PROJECT_FILE_VERSION, PROJECT_MIGRATIONS, type ProjectMigration } from './project-migrations';
import { withoutModelState } from './autosave-snapshots';
import { markProjectSaved } from './project-saved';
import { loadProjectDocument, projectDocument } from './project-store';
import { readSavedSectionCuts } from './saved-cuts-file';
import { readJoineryList } from '@/joinery/spec-file';
import { readCurrentTypes, readElementTypeList } from '@/element-types/spec';
import { readStructureProfileList } from '@ifc-lite/create';
import { readTagFields } from '@/tagfields/tag-fields-file';
import type { ProjectCivilDrawing, ProjectMaterial, ProjectTypicalSection, ElevationDirection, InteriorElevation, ProjectDocument, ProjectLevel, ProjectModelRef, ProjectSchedule, ProjectSheet, ProjectView, ProjectViewKind, SectionProjectPlane, UserLevel, ViewDetail } from './types';
import { freshProjectId } from './view-defaults';
import { HEX, WEIGHTS, readGraphics, readPhaseSource } from './view-graphics-file';

export const PROJECT_FILE_SUFFIX = '.ifclite-project.json';
export const PROJECT_FILE_FORMAT = 'ifclite-project';
export { PROJECT_FILE_VERSION };

export interface ProjectFile extends ProjectDocument {
  format: typeof PROJECT_FILE_FORMAT;
  version: typeof PROJECT_FILE_VERSION;
  savedAt: string;
}

export function serializeProject(doc: ProjectDocument, now = new Date()): string {
  const file: ProjectFile = { format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, savedAt: now.toISOString(), ...doc };
  return JSON.stringify(file, null, 2);
}

/**
 * Open a project file the person chose: load it and note it as the last file opened, so its own
 * autosave is not offered back next session. Autosave restores load with `loadProjectDocument`
 * directly. Kept out of the store so the drafting session does not reach the file reader.
 */
export function openProjectDocument(doc: ProjectDocument, options: { dirty?: boolean; now?: number; storage?: Parameters<typeof markProjectSaved>[2] } = {}): void {
  loadProjectDocument(doc, { dirty: options.dirty });
  noteProjectFile(projectDocument(), options.now, options.storage);
}

export function exportProjectFile(doc: ProjectDocument): void {
  const stem = sanitizeFilename(doc.name, { fallback: 'project' });
  downloadFile(serializeProject(doc), `${stem}${PROJECT_FILE_SUFFIX}`, 'application/json');
  noteProjectFile(doc);
}

/**
 * Notes `doc` as what a project file holds now (`project-saved.ts`). The autosave is compared to it in the
 * form a file is read back in, so it is noted in that form: the reader fills defaults a live project lacks.
 */
export function noteProjectFile(doc: ProjectDocument, now?: number, storage?: Parameters<typeof markProjectSaved>[2]): void {
  markProjectSaved(parseProjectFile(serializeProject(withoutModelState(doc).slim)), now, storage);
}

const VIEW_KINDS: readonly ProjectViewKind[] = ['plan', 'section', 'elevation', '3d', 'drafting'];
const DIRECTIONS: readonly ElevationDirection[] = ['north', 'south', 'east', 'west'];
const AXES = ['down', 'front', 'side'] as const;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fail(path: string, message: string): never {
  throw new Error(`Not a project file: ${path} ${message}`);
}

function readLevel(v: unknown, path: string): ProjectLevel {
  if (!isObject(v) || !isString(v.name) || !isNumber(v.elevation)) fail(path, 'must be a level { name, elevation }');
  const ids = Array.isArray(v.storeyGlobalIds) ? v.storeyGlobalIds.filter(isString) : [];
  return { name: v.name, elevation: v.elevation, storeyGlobalIds: ids };
}

function readRect(v: Json, path: string): Pick<ViewDetail, 'min' | 'max'> {
  const corner = (c: unknown, at: string) => {
    if (!isObject(c) || !isNumber(c.x) || !isNumber(c.y)) fail(at, 'must be { x, y }');
    return { x: c.x, y: c.y };
  };
  const min = corner(v.min, `${path}.min`);
  const max = corner(v.max, `${path}.max`);
  if (max.x <= min.x || max.y <= min.y) fail(path, 'must have min below and left of max');
  return { min, max };
}

function readDetail(v: unknown, path: string): ViewDetail {
  if (!isObject(v) || !isString(v.of) || !isNumber(v.number)) fail(path, 'must be { of, min, max, number }');
  return { of: v.of, ...readRect(v, path), number: v.number };
}

function readPlane(p: unknown, path: string): SectionProjectPlane {
  if (!isObject(p) || !AXES.includes(p.axis as (typeof AXES)[number]) || !isNumber(p.offset)) {
    fail(path, 'must be { axis, offset, flipped }');
  }
  const plane = { axis: p.axis as (typeof AXES)[number], offset: p.offset, flipped: p.flipped === true };
  return isObject(p.custom) ? { ...plane, custom: p.custom as never } : plane;
}

function readInterior(v: unknown, path: string): InteriorElevation {
  if (!isObject(v) || !isString(v.room)) fail(path, 'must be { room, plane, crop }');
  if (!isObject(v.crop)) fail(`${path}.crop`, 'must be { min, max }');
  return { room: v.room, plane: readPlane(v.plane, `${path}.plane`), crop: readRect(v.crop, `${path}.crop`) };
}

function readView(v: unknown, path: string): ProjectView {
  if (!isObject(v) || !isString(v.id) || !isString(v.name)) fail(path, 'must have a string id and name');
  if (!VIEW_KINDS.includes(v.kind as ProjectViewKind)) fail(`${path}.kind`, `must be one of ${VIEW_KINDS.join(', ')}`);
  const base = {
    id: v.id, name: v.name, auto: v.auto === true, createdAt: isNumber(v.createdAt) ? v.createdAt : 0,
    ...(isNumber(v.viewDepth) && v.viewDepth >= 0 ? { viewDepth: v.viewDepth } : {}),
    ...(typeof v.showHidden === 'boolean' ? { showHidden: v.showHidden } : {}),
    ...(v.detail !== undefined ? { detail: readDetail(v.detail, `${path}.detail`) } : {}),
    ...(isObject(v.graphics) ? { graphics: readGraphics(v.graphics) } : {}),
    ...(isNumber(v.scale) && v.scale > 0 ? { scale: v.scale } : {}),
    ...(Array.isArray(v.hiddenLayers) ? { hiddenLayers: v.hiddenLayers.filter(isString) } : {}),
  };
  switch (v.kind) {
    case 'plan':
      if (!isNumber(v.cutHeight)) fail(`${path}.cutHeight`, 'must be a number');
      return { ...base, kind: 'plan', level: readLevel(v.level, `${path}.level`), cutHeight: v.cutHeight, ...(v.site === true ? { site: true as const } : {}), ...(isDisciplineId(v.discipline) ? { discipline: v.discipline } : {}), ...(v.reflected === true ? { reflected: true } : {}) };
    case 'section': {
      const section = { ...base, kind: 'section' as const, plane: readPlane(v.plane, `${path}.plane`) };
      return isString(v.through) && v.through ? { ...section, through: v.through } : section;
    }
    case 'elevation':
      if (!DIRECTIONS.includes(v.direction as ElevationDirection)) fail(`${path}.direction`, `must be one of ${DIRECTIONS.join(', ')}`);
      if (v.planeOffset !== undefined && !isNumber(v.planeOffset)) fail(`${path}.planeOffset`, 'must be a number');
      return {
        ...base, kind: 'elevation', direction: v.direction as ElevationDirection, ...(v.planeOffset !== undefined ? { planeOffset: v.planeOffset } : {}),
        ...(v.interior !== undefined ? { interior: readInterior(v.interior, `${path}.interior`) } : {}),
      };
    case 'drafting':
      return { ...base, kind: 'drafting', ...(isNumber(v.number) && v.number > 0 ? { number: v.number } : {}) };
    default:
      return { ...base, kind: '3d', viewpoint: isObject(v.viewpoint) ? (v.viewpoint as never) : null, ...read3dPrint(v) };
  }
}

function readSheet(v: unknown, path: string): ProjectSheet {
  if (!isObject(v) || !isString(v.id) || !isString(v.number) || !isString(v.name)) fail(path, 'must be a sheet { id, number, name }');
  return { id: v.id, number: v.number, name: v.name, createdAt: isNumber(v.createdAt) ? v.createdAt : 0, ...readSheetLayout(v, path) };
}

function readModel(v: unknown, path: string): ProjectModelRef {
  if (!isObject(v) || !isString(v.key) || !isString(v.name)) fail(path, 'must be a model { key, name }');
  const model: ProjectModelRef = { key: v.key, name: v.name };
  // A role or style this version does not know (a newer file, a hand edit) is dropped, not fatal: the model opens linked, in its role's style.
  if (v.role === 'host' || v.role === 'linked') model.role = v.role;
  else if (v.role !== undefined) {
    model.role = 'linked';
    console.warn(`[ifcsheet] project file ${path}.role: ${JSON.stringify(v.role)} is not host or linked; the model is opened as linked`);
  }
  if (v.drawStyle === 'normal' || v.drawStyle === 'halftone') model.drawStyle = v.drawStyle;
  else if (v.drawStyle !== undefined) console.warn(`[ifcsheet] project file ${path}.drawStyle: ${JSON.stringify(v.drawStyle)} is not normal or halftone; the model's default style is used`);
  return model;
}

/** The versions a reader brings files to: this build's, unless a test stands in a later one. */
export interface ProjectFileSchema {
  migrations: Readonly<Record<number, ProjectMigration>>;
  current: number;
}

const THIS_BUILD: ProjectFileSchema = { migrations: PROJECT_MIGRATIONS, current: PROJECT_FILE_VERSION };

const readSources = (raw: Record<string, unknown>): Pick<ProjectDocument, 'titleBlockSources' | 'titleBlockParams' | 'titleBlockTemplate'> => {
  const titleBlockSources = readTitleSources(raw.titleBlockSources);
  const titleBlockParams = readTitleBlockParams(raw.titleBlockParams);
  const titleBlockTemplate = readTitleBlockTemplate(raw.titleBlockTemplate);
  return { ...(titleBlockSources ? { titleBlockSources } : {}), ...(titleBlockParams ? { titleBlockParams } : {}), ...(titleBlockTemplate ? { titleBlockTemplate } : {}) };
};

/** Parse and validate a project file's text. Throws with the first problem found. */
export function parseProjectFile(text: string, schema: ProjectFileSchema = THIS_BUILD): ProjectDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Not a project file: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!isObject(parsed) || parsed.format !== PROJECT_FILE_FORMAT) fail('/format', `must be "${PROJECT_FILE_FORMAT}"`);
  const version = declaredVersion(parsed);
  if (version === null) fail('/version', 'must be a whole number from 1');
  // Older files are brought up to this build's shape first; a newer one throws here, before anything is read.
  const raw = migrateProject(parsed, version, schema.migrations, schema.current);
  const list = (key: string): unknown[] => {
    const value = raw[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) fail(`/${key}`, 'must be an array');
    return value;
  };
  return {
    name: isString(raw.name) && raw.name.trim() ? raw.name : resolve('names.project.untitled'),
    models: list('models').map((m, i) => readModel(m, `/models/${i}`)),
    views: list('views').map((v, i) => readView(v, `/views/${i}`)),
    sheets: list('sheets').map((s, i) => readSheet(s, `/sheets/${i}`)),
    // Absent in a file saved before the title block was the project's (`liftSheetTitleBlocks` fills it on load).
    ...(raw.titleBlock !== undefined ? { titleBlock: readTitleBlock(raw.titleBlock) ?? {} } : {}),
    ...readSources(raw),
    drafts: list('drafts').map((d, i) => readDraft(d, `/drafts/${i}`)),
    draftLayers: list('draftLayers').map((l, i) => readDraftLayer(l, `/draftLayers/${i}`)),
    hatchPatterns: isString(raw.hatchPatterns) ? raw.hatchPatterns : '',
    symbolFlips: readFlips(raw.symbolFlips),
    ...(raw.openingLines === 'hinge' || raw.openingLines === 'handle' ? { openingLines: raw.openingLines } : {}),
    ...readStandards(raw),
    joineryTypes: readJoineryList(raw.joineryTypes),
    currentJoinery: readCurrentJoinery(raw.currentJoinery),
    ...(raw.joineryMapping !== undefined ? { joineryMapping: readJoineryMapping(raw.joineryMapping) } : {}),
    elementTypes: readElementTypeList(raw.elementTypes),
    currentTypes: readCurrentTypes(raw.currentTypes),
    schedules: list('schedules').flatMap((v) => readSchedule(v)),
    structureProfiles: readStructureProfileList(raw.structureProfiles),
    civilDrawings: list('civilDrawings').flatMap((v) => readCivilDrawing(v)),
    typicalSections: list('typicalSections').flatMap((v) => readTypicalSection(v)),
    materials: list('materials').flatMap((v) => readMaterial(v)),
    cadLayers: list('cadLayers').map((v, i) => readCadLayerRule(v, `/cadLayers/${i}`)),
    savedSectionCuts: list('savedSectionCuts').flatMap((v) => readSavedSectionCuts(v)),
    ...(readPhaseSource(raw.phaseSource) ? { phaseSource: readPhaseSource(raw.phaseSource) } : {}),
    annotationTypes: readList(raw, 'annotationTypes', readAnnotationType),
    symbols: readList(raw, 'symbols', readSymbol),
    legends: readList(raw, 'legends', readLegend),
    details: readList(raw, 'details', readLibraryDetail),
    issues: readIssues(raw.issues),
    sheetTemplates: list('sheetTemplates').flatMap((v) => readTemplate(v) ?? []),
    seriesTemplates: readSeriesTemplates(raw.seriesTemplates),
    ...(raw.sheetNumbering !== undefined ? { sheetNumbering: readNumberingScheme(raw.sheetNumbering) } : {}),
    ...(raw.tagFields !== undefined ? { tagFields: readTagFields(raw.tagFields, '/tagFields') } : {}),
    ...(raw.comments !== undefined ? { comments: readComments(raw.comments) } : {}),
    revisions: readRevisions(raw.revisions),
    ...(raw.modelState !== undefined ? { modelState: readSnapshot(raw.modelState, '/modelState') } : {}),
    ...(typeof raw.siteArea === 'number' && Number.isFinite(raw.siteArea) && raw.siteArea > 0 ? { siteArea: raw.siteArea } : {}),
    ...readUrbanSettings(raw.urbanSettings),
    ...readUserLevels(raw.userLevels),
  };
}

/** The levels the person defined; an entry that is not a name and a height is dropped, and an id repeated is made new. */
function readUserLevels(raw: unknown): Pick<ProjectDocument, 'userLevels'> {
  if (!Array.isArray(raw)) return {};
  const seen = new Set<string>();
  const levels = raw.flatMap((v): UserLevel[] => {
    if (!isObject(v) || !isString(v.name) || !v.name.trim() || !isNumber(v.elevation)) return [];
    const id = isString(v.id) && v.id && !seen.has(v.id) ? v.id : freshProjectId('level');
    seen.add(id);
    return [{ id, name: v.name, elevation: v.elevation }];
  });
  return levels.length ? { userLevels: levels } : {};
}

/** The urban settings; a field that is not what it should be is dropped (its default applies). */
function readUrbanSettings(raw: unknown): Pick<ProjectDocument, 'urbanSettings'> {
  if (!isObject(raw)) return {};
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const out: NonNullable<ProjectDocument['urbanSettings']> = {};
  if (finite(raw.terrainLevel)) out.terrainLevel = raw.terrainLevel;
  if (finite(raw.zeroElevation)) out.zeroElevation = raw.zeroElevation;
  if (isObject(raw.cutExcluded)) {
    const chosen = Object.entries(raw.cutExcluded).filter((e): e is [string, boolean] => typeof e[1] === 'boolean');
    if (chosen.length) out.cutExcluded = Object.fromEntries(chosen);
  }
  return Object.keys(out).length ? { urbanSettings: out } : {};
}


/** `symbolFlips`: GlobalId → 1..3; anything else is dropped. */
function readFlips(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [id, bits] of Object.entries(value)) {
    if (typeof bits === 'number' && Number.isInteger(bits) && bits >= 1 && bits <= 3) out[id] = bits;
  }
  return out;
}

export async function importProjectFile(file: File): Promise<ProjectDocument> {
  return parseProjectFile(await file.text());
}

function readCurrentJoinery(raw: unknown): { door?: string; window?: string } {
  if (!isObject(raw)) return {};
  return {
    ...(isString(raw.door) ? { door: raw.door } : {}),
    ...(isString(raw.window) ? { window: raw.window } : {}),
  };
}

export function readMaterial(raw: unknown): ProjectMaterial[] {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.name) || !raw.name.trim()) return [];
  const out: ProjectMaterial = { id: raw.id, name: raw.name };
  if (raw.hatch === null || isString(raw.hatch)) out.hatch = raw.hatch;
  if (isNumber(raw.hatchScale) && raw.hatchScale > 0) out.hatchScale = raw.hatchScale;
  if (raw.fill === null || (isString(raw.fill) && HEX.test(raw.fill))) out.fill = raw.fill;
  if (isString(raw.hatchPen) && WEIGHTS.has(raw.hatchPen)) out.hatchPen = raw.hatchPen as ProjectMaterial['hatchPen'];
  if (raw.membrane === true) out.membrane = true;
  return [out];
}

function readTypicalSection(raw: unknown): ProjectTypicalSection[] {
  if (!isObject(raw) || !isString(raw.id) || !isObject(raw.assembly)) return [];
  const a = raw.assembly;
  const lane = (v: unknown) => (isObject(v) && isNumber(v.width) && v.width > 0 && isNumber(v.slope) ? { width: v.width, slope: v.slope } : null);
  const lanes = Array.isArray(a.lanes) ? a.lanes.map(lane).filter((l): l is { width: number; slope: number } => l !== null) : [];
  const layers = Array.isArray(a.layers) ? a.layers.flatMap((l) => (isObject(l) && isString(l.name) && isNumber(l.thickness) && l.thickness > 0
    ? [{ name: l.name, thickness: l.thickness, color: isString(l.color) && /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : '#8a7f6a' }] : [])) : [];
  const day = isObject(a.daylight) ? a.daylight : {};
  if (!lanes.length || !layers.length) return [];
  return [{
    id: raw.id, name: isString(raw.name) && raw.name ? raw.name : 'Typical section',
    assembly: {
      lanes, shoulder: lane(a.shoulder), layers,
      daylight: { cutSlope: isNumber(day.cutSlope) && day.cutSlope > 0 ? day.cutSlope : 1, fillSlope: isNumber(day.fillSlope) && day.fillSlope > 0 ? day.fillSlope : 1.5 },
      ...(isNumber(a.nominalDepth) && a.nominalDepth > 0 ? { nominalDepth: a.nominalDepth } : {}),
    },
  }];
}

function readCivilDrawing(raw: unknown): ProjectCivilDrawing[] {
  if (!isObject(raw) || !isString(raw.id) || !isString(raw.corridorGlobalId)) return [];
  const num = (v: unknown, min: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min ? v : undefined);
  const out: ProjectCivilDrawing = {
    id: raw.id, name: isString(raw.name) && raw.name ? raw.name : 'Road drawing', kind: raw.kind === 'sections' ? 'sections' : 'profile',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0, corridorGlobalId: raw.corridorGlobalId, scale: num(raw.scale, 1) ?? (raw.kind === 'sections' ? 200 : 1000),
  };
  for (const key of ['vExaggeration', 'stationStep', 'elevationStep', 'every', 'columns', 'halfWidth'] as const) {
    const v = num(raw[key], 0);
    if (v !== undefined) out[key] = v;
  }
  if (Array.isArray(raw.stations)) out.stations = raw.stations.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return [out];
}

function readSchedule(raw: unknown): ProjectSchedule[] {
  if (!isObject(raw) || !isString(raw.id)) return [];
  const kind = raw.kind === 'door' || raw.kind === 'window' || raw.kind === 'materials' || raw.kind === 'types' || raw.kind === 'finishes' || raw.kind === 'register' || raw.kind === 'urban' ? raw.kind : 'all';
  const out: ProjectSchedule = { id: raw.id, name: isString(raw.name) && raw.name ? raw.name : 'Schedule', kind, createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0 };
  if (typeof raw.scale === 'number' && raw.scale > 0) out.scale = raw.scale;
  return [out];
}
