/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A project filled with one of everything survives save and open, compared
 * deeply, on both paths: the `.ifclite-project.json` sidecar and the `.bvproj`
 * package.
 *
 * The test is structural. Every fixture is `Required<>` of its state type, so
 * a field added to a state type does not compile until the fixture sets it;
 * the document is compared whole, so a field the writer or the reader forgets
 * fails here; and the project store is checked key by key, so a new store
 * field must be either persisted or listed in `SESSION_ONLY` with its reason.
 *
 * A field the fixture leaves at its default proves nothing (a writer that drops
 * it reads back the same default), so every document key (those a reset store
 * writes, those the fixture sets, and those of `EMPTY_PROJECT`) must hold a
 * value that is not its default. Every schedule kind and view kind is in
 * the fixture, so a kind the reader does not know fails the comparison.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { defaultDoorSpec, defaultWindowSpec, profileFromPreset } from '@ifc-lite/create';
import { DEFAULT_DIM_STYLE, DEFAULT_TEXT_STYLE } from '@/drafting/styles';
import type { CadLayerRule } from './cad-layers.js';
import type { AnnotationType, DraftSymbol, ProjectLegend } from '@/catalogue/types';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { defaultTypeSpec } from '@/element-types/spec';
import { DEFAULT_JOINERY_MAPPING } from '@/joinery/symbol-mapping';
import type { AnnotationShape, DraftEntity, DraftLayer, DraftShape, EntityShape } from '@/drafting/types';
import { EMPTY_PROJECT, loadProjectDocument, PROJECT_DOCUMENT_KEYS, projectDocument, resetProject, useProjectStore, type ProjectState } from './project-store.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { SEQUENTIAL_SCHEME } from './numbering.js';
import { buildPackage, readPackage, unzipPackage, zipPackage } from './package/package-io.js';
import type {
  CategoryGraphics, DraftingProjectView, ElevationProjectView, PlanProjectView, ProjectCivilDrawing, ProjectDocument, ProjectMaterial, ProjectSchedule,
  ProjectSheet, ProjectViewKind, SectionProjectView, SheetViewport, ThreeDProjectView, ViewGraphics,
} from './types.js';

/** Store fields that are deliberately not part of the project file, each with its reason. */
const SESSION_ONLY: Record<Exclude<keyof ProjectState, keyof ProjectDocument>, string> = {
  levels: 'derived from the loaded models on every load',
  activeItemId: 'which navigator item is selected: a session choice, not a document',
  dirty: 'whether there are unsaved edits: computed against what was saved',
};

/**
 * State a user sets that lives outside the project store and is not saved, on purpose.
 * Not enforced by a type: a state holder outside the project store cannot be found from it.
 */
const SESSION_ONLY_ELSEWHERE: Record<string, string> = {
  'open tabs (project/document-tabs.ts)': 'which views are open is workspace layout, reset on open',
  'selection, camera, zoom and pan (viewer store, drafting/session.ts)': 'where the user is looking, not what the project is',
  'drawing display toggles (viewer store drawing2DDisplayOptions)': 'panel toggles for the live drawing; a view carries its own graphics and scale',
  'wall join style, drafting lines in 3D (lib/wall-join-prefs.ts, lib/drafting-3d-prefs.ts)': 'device preferences kept in localStorage, not part of any one project',
  'generated drawings (project/view-drawings.ts)': 'derived from the model and the view, regenerated on open',
};

const pt = (x: number, y: number) => ({ x, y });

const category: Required<CategoryGraphics> = {
  visible: false, lineColor: '#112233', fillColor: '#445566', lineWeight: 'heavy', cutHatch: 'ANSI31', hatchScale: 2.5,
};
const graphics: Required<ViewGraphics> = {
  presetId: 'structure', categories: { walls: category, doors: { visible: false } }, grid: { visible: false, ends: 'start' },
  phases: { show: ['existing', 'demolish'], styles: { demolish: { lineColor: '#ffcc00', lineWeight: 'heavy', dashed: false, fillColor: '#fff2a8' } } },
};

const base = { auto: false, createdAt: 11, viewDepth: 4.5, showHidden: false, detail: { of: 'v-src', min: { x: -1.5, y: 2 }, max: { x: 3.25, y: 6 }, number: 3 }, graphics, scale: 50, hiddenLayers: ['L-hidden'] };

const VIEWS: { [K in ProjectViewKind]: Required<Extract<import('./types.js').ProjectView, { kind: K }>> } = {
  plan: {
    ...base, id: 'v-plan', name: 'Level 1', kind: 'plan', cutHeight: 1.4, site: true, discipline: 'foundation', reflected: true,
    level: { name: 'Level 1', elevation: 3.2, storeyGlobalIds: ['G-A', 'G-B'] },
  } satisfies Required<PlanProjectView>,
  section: {
    ...base, id: 'v-sec', name: 'Section A', kind: 'section', through: 'Through the stair',
    plane: {
      axis: 'front', offset: -2.5, flipped: true,
      custom: { normal: [0, 0, 1], distance: 1.5, pickedAt: [1, 2, 3], tangent: [1, 0, 0], bitangent: [0, 1, 0] },
    },
  } satisfies Required<SectionProjectView>,
  elevation: {
    ...base, showHidden: true, id: 'v-el', name: 'East', kind: 'elevation', direction: 'east', planeOffset: 7.25,
    interior: {
      room: 'G-ROOM',
      plane: { axis: 'side', offset: 4.5, flipped: false, custom: { normal: [-1, 0, 0], distance: -4.5, pickedAt: [4.5, 0, -2], tangent: [0, 0, 1], bitangent: [0, 1, 0] } },
      crop: { min: { x: -1.75, y: 0 }, max: { x: 1.75, y: 2.5 } },
    },
  } satisfies Required<ElevationProjectView>,
  '3d': {
    ...base, id: 'v-3d', name: 'Axo', kind: '3d',
    viewpoint: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fov: 50, projectionMode: 'orthographic', orthoSize: 12 },
    projection: 'axonometric', preset: 'sw', shaded: true,
    raster: { href: 'data:image/png;base64,AAAA', widthPx: 1772, heightPx: 1182, widthMm: 150, heightMm: 100 },
  } satisfies Required<ThreeDProjectView>,
  drafting: { ...base, id: 'v-draft', name: 'Typical parapet', kind: 'drafting', number: 4 } satisfies Required<DraftingProjectView>,
};

const GEOMETRY: { [K in DraftShape['type']]: Required<Extract<DraftShape, { type: K }>> } = {
  line: { type: 'line', a: pt(0, 0), b: pt(3, 4) },
  polyline: { type: 'polyline', pts: [pt(0, 0), pt(1, 0), pt(1, 1)], closed: true },
  circle: { type: 'circle', c: pt(1, 1), r: 2 },
  arc: { type: 'arc', c: pt(1, 1), r: 2, start: 0.5, end: 2 },
};
const ANNOTATION: { [K in AnnotationShape['type']]: Required<Extract<AnnotationShape, { type: K }>> } = {
  text: { type: 'text', p: pt(1, 1), text: 'Kitchen\n12.50 m²', height: 0.25, rotation: 1.2, frame: 'bubble', leader: pt(4, 1) },
  leader: { type: 'leader', pts: [pt(0, 0), pt(1, 1)], text: 'W1', height: 0.25 },
  dimension: { type: 'dimension', variant: 'linear', a: pt(0, 0), b: pt(5, 0), at: pt(2, 1), height: 0.25, text: 'EQ', textAt: pt(3, 1.5) },
  radial: { type: 'radial', c: pt(0, 0), r: 2, at: pt(3, 3), diameter: true, height: 0.25 },
  angular: { type: 'angular', c: pt(0, 0), a: pt(1, 0), b: pt(0, 1), at: pt(2, 2), height: 0.25 },
  level: { type: 'level', p: pt(1, 1), value: 3.2, height: 0.25, ref: { at: pt(1, 1), storey: 'Level 1' } },
  axis: { type: 'axis', a: pt(0, 0), b: pt(0, 9), label: 'B', bubble: 'square', ends: 'start', size: 0.8, height: 0.25, lineType: 'dotted' },
  symbol: { type: 'symbol', symbolId: 'sym-model', p: pt(2, 3), scale: 1.5, rotation: 0.7, followsNorth: true },
  hatch: { type: 'hatch', loops: [[pt(0, 0), pt(2, 0), pt(2, 2)], [pt(0.5, 0.2), pt(1, 0.2), pt(1, 0.8)]], pattern: 'ANSI31', scale: 2, angle: 0.4, color: '#aa5500' },
};
const SHAPES: EntityShape[] = [...Object.values(GEOMETRY), ...Object.values(ANNOTATION)];

// Ordered by view: a package keeps a view's drafts in drawing order (that is the stacking), views in path order.
const drafts: DraftEntity[] = SHAPES.map((shape, i) => ({
  id: `d${i}`, viewId: i < SHAPES.length / 2 ? 'v-plan' : 'v-sec', layerId: i % 2 ? 'L-pen' : '0', shape,
  params: { ifcClass: 'IfcWall', depth: 2.7, flag: true, textStyle: 'big', dimStyle: 'arch', tagOf: '2O2Fr$t4X7Zf8NOew3FLOH', sectionOf: 'v-sec', detailOf: 'v-det', detailPart: 8, atype: 'at1', labelOf: '3cUkl32yn9qRSPvBJVyWYp' },
}));

const annotationType: Required<AnnotationType> = {
  id: 'at1', name: 'Grid axis', tool: 'axis', textStyle: 'big', dimStyle: 'arch', layer: 'L-pen',
  axis: { bubble: 'square', ends: 'start', size: 0.8, lineType: 'dashed' }, hatch: { pattern: 'ANSI31', scale: 2, angle: 45 }, tagField: 'class',
  label: { template: 'Fire {Pset_WallCommon.FireRating}\n{Qto_WallBaseQuantities.Length:0.00 m|n/a}', frame: 'rounded', missing: 'field' },
};
const symbols: Required<DraftSymbol>[] = [
  { id: 'sym-paper', name: 'Mark', unit: 'paper', shapes: [{ type: 'circle', c: pt(0, 0), r: 4 }, { type: 'text', p: pt(0, 1), text: 'A', height: 2.5, rotation: 0.3 }, { type: 'line', a: pt(0, 0), b: pt(5, 0) }] },
  { id: 'sym-model', name: 'Scale bar', unit: 'model', shapes: [{ type: 'polyline', pts: [pt(0, 0), pt(5, 0)], closed: false }] },
];
const legend: Required<ProjectLegend> = {
  id: 'lg1', name: 'Plan legend', createdAt: 3, title: 'Key', showTitle: false, scope: 'sheet', scopeId: 'sh1', categories: ['symbols', 'materials'],
  columns: 2, rowHeight: 9, swatchWidth: 22, textStyle: 'big', headings: false,
};

const layer: Required<DraftLayer> = { id: 'L-pen', name: 'Pen', color: '#cc0000', visible: false, locked: true, lineWeight: 0.5, lineType: 'dashdot', group: 'g1' };

const viewport: Required<SheetViewport> = {
  id: 'vp1', viewId: 'v-plan', x: 210, y: 148.5, scale: 50, width: 300, height: 200, center: { x: 4, y: 5 }, hiddenLayers: ['L-pen'], page: 2, keyPlanOf: 'vp0', drawingNumber: '7',
};
const sheet: Required<ProjectSheet> = {
  id: 'sh1', number: 'A-201', autoNumber: true, numberOverride: true, series: 'elevations', name: 'Plans', createdAt: 9, paper: { kind: 'elongated', base: 'A2', factor: 3 }, orientation: 'portrait', viewports: [viewport],
  frame: { margins: { top: 8, right: 9, bottom: 11, left: 20 }, titleBlock: 'right' }, templateId: 'tpl1',
  titleBlock: { project: 'House', drawnBy: 'PC', date: '2026-10-12' }, revisionIds: ['rev-b'],
  titleBlockParams: { Phase: 'PAC' },
};
/** One schedule of every kind: a kind added to `ProjectSchedule['kind']` does not compile until it is listed here. */
const SCHEDULES: { [K in ProjectSchedule['kind']]: Required<ProjectSchedule> & { kind: K } } = {
  door: { id: 'sc1', name: 'Doors', kind: 'door', createdAt: 5, scale: 25 },
  window: { id: 'sc2', name: 'Windows', kind: 'window', createdAt: 6, scale: 20 },
  all: { id: 'sc3', name: 'Joinery', kind: 'all', createdAt: 7, scale: 50 },
  materials: { id: 'sc4', name: 'Takeoff', kind: 'materials', createdAt: 8, scale: 100 },
  types: { id: 'sc5', name: 'Quantities by type', kind: 'types', createdAt: 9, scale: 100 },
  finishes: { id: 'sc6', name: 'Room finishes', kind: 'finishes', createdAt: 10, scale: 100 },
  register: { id: 'sc7', name: 'Drawing register', kind: 'register', createdAt: 11, scale: 100 },
  urban: { id: 'sc8', name: 'Urban indicators', kind: 'urban', createdAt: 12, scale: 100 },
};
const civil: Required<ProjectCivilDrawing> = {
  id: 'c1', name: 'DN1 sections', kind: 'sections', createdAt: 3, corridorGlobalId: '2O2Fr$t4X7Zf8NOew3FLOH', scale: 200, vExaggeration: 10,
  stationStep: 50, elevationStep: 5, every: 25, stations: [0, 100, 250], columns: 3, halfWidth: 20,
};
const material: Required<ProjectMaterial> = { id: 'm1', name: 'Mineral wool', hatch: 'INSULATION', hatchScale: 1.5, fill: '#ffeeaa', hatchPen: 'light', membrane: true };

const cadRule: Required<CadLayerRule> = {
  id: 'cad1', source: 'CUT', kind: 'text', ifcClasses: ['IfcWall', 'IfcWallStandardCase'], material: 'Beton armat', layer: 'A-WALL-CUT', color: '#7f1d1d', lineWeight: 0.5, lineType: 'dashed',
};

/** Every field of the project document set to something that is not its default. */
const FULL: Required<ProjectDocument> = {
  name: 'Full house',
  models: [{ key: 'hash-arch', name: 'arch.ifc' }],
  views: Object.values(VIEWS),
  sheets: [sheet],
  revisions: [{ id: 'rev-a', code: 'A', date: '2026-09-01', description: 'Prima emitere: ș ț ă', by: 'PC' }, { id: 'rev-b', code: 'B', date: '2026-10-12', description: 'Pereți noi', by: 'IC' }],
  titleBlock: { project: 'Full house', client: 'Owner', checkedBy: 'PC', logo: 'data:image/png;base64,iVBORw0KGgo=' },
  titleBlockParams: [{ name: 'Phase', value: 'DTAC' }, { name: 'ProjectNumber', value: '2026-014' }],
  titleBlockTemplate: { items: [
    { id: 'tb1', kind: 'rect', x: 0, y: 0, w: 180, h: 50, weight: 0.5 },
    { id: 'tb2', kind: 'line', x1: 0, y1: 25, x2: 130, y2: 25, weight: 0.18 },
    { id: 'tb3', kind: 'text', x: 2, y: 8, size: 3.5, text: 'Phase: {Phase}', bold: true, muted: true, fit: 61 },
    { id: 'tb4', kind: 'logo', x: 132, y: 1.5, w: 46, h: 11 },
  ] },
  titleBlockSources: { address: [{ kind: 'attribute', on: 'IfcBuilding', name: 'BuildingAddress' }], organisation: [{ kind: 'pset', pset: 'Pset_ProjectCommon', property: 'Office' }, { kind: 'owner', part: 'developer' }] },
  drafts,
  draftLayers: [{ id: '0', name: '0', color: '#18181b', visible: true, locked: false }, layer],
  hatchPatterns: '*MY-LINES, test\n0, 0,0, 0,2\n',
  textStyles: [{ ...DEFAULT_TEXT_STYLE }, { id: 'big', name: 'Big', height: 5, font: 'serif', bold: true, italic: true, color: '#aa0000' }],
  dimStyles: [{ ...DEFAULT_DIM_STYLE }, {
    id: 'arch', name: 'Arch', textStyle: 'big', arrow: 'arrow', arrowSize: 2, extGap: 0.5, extOver: 2, placement: 'below', textGap: 0.8, precision: 0, unit: 'mm', color: '#0000aa',
  }],
  layerGroups: [{ id: 'g1', name: 'Annotation', visible: false, locked: true }],
  graphicStandard: 'ro-practice',
  openingLines: 'hinge',
  symbolFlips: { '2O2Fr$t4X7Zf8NOew3FLOH': 3 },
  joineryTypes: [{ ...defaultDoorSpec('D-1'), id: 'j1' }, { ...defaultWindowSpec('W-1'), id: 'j2', columns: [2, 1], panels: [{ col: 0, row: 0, operation: 'tilt-turn-right' }] }],
  currentJoinery: { door: 'j1', window: 'j2' },
  joineryMapping: { ...DEFAULT_JOINERY_MAPPING, byName: false, byDimensions: false, tolerance: 0.07, aliases: { j1: ['Door 90'] } },
  elementTypes: (['wall', 'slab', 'column', 'beam', 'roof', 'opening'] as const).map((kind, i) => ({ ...defaultTypeSpec(kind), kind, id: `t${i}`, name: `Type ${kind}`, mark: `M${i}` }) as never),
  currentTypes: { wall: 't0', slab: 't1', column: 't2' },
  schedules: Object.values(SCHEDULES),
  sheetTemplates: [{ id: 'tpl1', name: 'Long elevations', paper: { kind: 'custom', widthMm: 500, heightMm: 700 }, orientation: 'portrait', frame: { margins: { top: 8, right: 9, bottom: 11, left: 20 }, titleBlock: 'right' } }],
  seriesTemplates: { plans: 'builtin:a1-plans', details: 'tpl1' },
  structureProfiles: [profileFromPreset('box-tunnel', 'sp1', 'Culvert 2x2')],
  civilDrawings: [civil],
  typicalSections: [{ id: 'ts1', name: 'Rural', assembly: { lanes: [{ width: 3.5, slope: -2.5 }], shoulder: { width: 1, slope: -4 }, layers: [{ name: 'Asphalt', thickness: 0.1, color: '#333333' }], daylight: { cutSlope: 1, fillSlope: 1.5 }, nominalDepth: 0.6 } }],
  materials: [material],
  cadLayers: [cadRule],
  phaseSource: { mapping: { set: 'Faza', property: 'Stare', values: { Existent: 'existing', Desfiintare: 'demolish', Propus: 'new' } }, unmarked: 'new' },
  annotationTypes: [annotationType],
  symbols,
  legends: [legend],
  sheetNumbering: { discipline: 'AR', continuous: true, groups: { ...SEQUENTIAL_SCHEME.groups, plans: { prefix: 'P', separator: '.', start: 5, digits: 4, step: 5 } } },
  details: [{
    id: 'dt1', name: 'Typical parapet', scale: 10,
    drafts: drafts.slice(0, 3).map(({ viewId: _viewId, ...rest }) => rest),
    layers: [{ id: 'L-pen', name: 'Pen', color: '#cc0000', visible: false, locked: true, lineWeight: 0.5, lineType: 'dashdot' }],
    hatchPatterns: '*MY-LINES, test\n0, 0,0, 0,2\n', symbols,
  }],
  tagFields: { door: { mark: [{ kind: 'pset', pset: 'Pset_DoorCommon', property: 'Reference' }, { kind: 'attribute', name: 'Mark' }] }, room: { name: [{ kind: 'quantity', qto: 'Qto_SpaceBaseQuantities', name: 'NetFloorArea' }, { kind: 'type-pset', pset: 'Pset_X', property: 'Y' }] } },
  issues: [{
    id: 'iss1', name: 'Planning issue', date: '2026-10-13', createdAt: 1760000000000,
    sheets: [{ number: 'A-101', title: 'Ground floor', scale: '1:50, 1:100', paper: 'A3×3', orientation: 'portrait', revision: 'B', fingerprint: '0123456789abcd' }],
  }],
  comments: [{
    id: 'comment-1', sheetId: 'sh1', x: 120.5, y: 80.25, viewportId: 'vp1', viewId: 'v-plan', point: { x: 3.5, y: -2 }, elementGuid: '2O2Fr$t4X7Zf8NOew3FLOH',
    author: 'Ana Ionescu', createdAt: 1760000000000, status: 'done', text: 'Cota lipsă la ușă', replies: [{ id: 'reply-1', author: 'PC', createdAt: 1760000001000, text: 'Adăugată', bcfGuid: '3f2b1c0e-7d4a-4e8b-9c1d-2a3b4c5d6e7f' }],
    // The BCF GUIDs it went out with, kept so the next export updates the same topic (PR #127).
    bcfGuid: '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d', bcfViewpointGuid: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  }],
  modelState: snapshotFromElements([{ k: '2O2Fr$t4X7Zf8NOew3FLOH', t: 'IfcWall', n: 'Wall', d: 'abcdef0123', g: 'a1b2c3d4e', a: [0, 0, 0, 4, 0.2, 3], p: 'Site/Building/Level 0' }], 7),
  siteArea: 1250.5,
  urbanSettings: { terrainLevel: -0.6, zeroElevation: 245.2, cutExcluded: { Subsol: true, Demisol: false } },
  userLevels: [{ id: 'level-a', name: 'Mezzanine', elevation: 2.4 }, { id: 'level-b', name: 'Roof terrace', elevation: 6.35 }],
  savedSectionCuts: [{
    id: 'cut1', name: 'Stair cut', createdAt: 1, updatedAt: 2,
    plane: { axis: 'side', position: 4.2, flipped: true, capStyle: { fillColor: [1, 0.5, 0, 1], strokeColor: [0, 0, 0, 1], pattern: 'brick', spacingPx: 6, angleRad: 0.5, widthPx: 2, secondaryAngleRad: -0.5 }, showCap: false, showOutlines: false },
  }],
};

/** Where two JSON values differ, as paths: a failure names the field that was lost. */
function diffPaths(want: unknown, got: unknown, path = ''): string[] {
  if (Object.is(want, got)) return [];
  const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  if (!object(want) || !object(got) || Array.isArray(want) !== Array.isArray(got)) return [`${path || '/'}: ${JSON.stringify(want)} became ${JSON.stringify(got)}`];
  return [...new Set([...Object.keys(want), ...Object.keys(got)])].flatMap((k) => diffPaths(want[k], got[k], `${path}/${k}`));
}
const same = (got: unknown) => assert.deepEqual(diffPaths(FULL, got), []);

beforeEach(() => resetProject());

describe('project round trip, one of everything', () => {
  it('the fixture covers every shape type and view kind', () => {
    assert.deepEqual(new Set(drafts.map((d) => d.shape.type)), new Set([...Object.keys(GEOMETRY), ...Object.keys(ANNOTATION)]));
    assert.equal(new Set(FULL.views.map((v) => v.kind)).size, Object.keys(VIEWS).length);
    assert.equal(new Set(FULL.schedules?.map((s) => s.kind)).size, Object.keys(SCHEDULES).length);
  });

  it('sets every document field to something that is not its default', () => {
    // The keys come from the document itself (PROJECT_DOCUMENT_KEYS, the store's DOCUMENT_FIELDS), not a list kept here: whatever a
    // reset store writes, whatever the fixture sets, and whatever EMPTY_PROJECT names.
    const defaults = projectDocument();
    const keys = [...new Set([...PROJECT_DOCUMENT_KEYS, ...Object.keys(defaults), ...Object.keys(FULL), ...Object.keys(EMPTY_PROJECT)])] as (keyof ProjectDocument)[];
    const empty = (v: unknown) => v === undefined || v === '' || (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
    const unset = keys.filter((k) => empty(FULL[k]) || isDeepStrictEqual(FULL[k], defaults[k]) || isDeepStrictEqual(FULL[k], EMPTY_PROJECT[k]));
    assert.deepEqual(unset, [], `give these fields a non-default value in FULL, so a save that drops them fails: ${unset.join(', ')}`);
  });

  it('survives the .ifclite-project.json sidecar', () => {
    same(parseProjectFile(serializeProject(FULL)));
  });

  it('survives the .bvproj package', async () => {
    const { files } = await buildPackage({ projectId: 'p', doc: FULL, models: [] });
    const opened = await readPackage(unzipPackage(zipPackage(files)));
    same(opened.doc);
  });

  it('survives the store: load, then the document the writer reads back', () => {
    loadProjectDocument(FULL);
    same(projectDocument());
  });

  it('the writer reads every persisted store field, and every other store field is listed as session-only', () => {
    loadProjectDocument(FULL);
    const stored = Object.keys(useProjectStore.getState());
    const written = new Set(Object.keys(projectDocument()));
    const missed = stored.filter((k) => !written.has(k) && !(k in SESSION_ONLY));
    assert.deepEqual(missed, [], `store fields neither saved nor listed in SESSION_ONLY: ${missed.join(', ')}`);
    assert.deepEqual([...written].sort(), Object.keys(FULL).sort());
  });

  it('names a reason for everything it leaves out on purpose', () => {
    for (const [what, reason] of [...Object.entries(SESSION_ONLY), ...Object.entries(SESSION_ONLY_ELSEWHERE)]) assert.ok(reason.length > 10, what);
  });

  it('opens a file written before the later fields existed', () => {
    const old = { ...JSON.parse(serializeProject(FULL)) as Record<string, unknown> };
    delete old.openingLines;
    delete old.symbolFlips;
    delete old.savedSectionCuts;
    const doc = parseProjectFile(JSON.stringify(old));
    assert.equal(doc.openingLines, undefined);
    assert.deepEqual(doc.symbolFlips, {});
    assert.deepEqual(doc.savedSectionCuts, []);
  });
});
