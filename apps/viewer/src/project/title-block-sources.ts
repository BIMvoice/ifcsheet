/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where each title block field gets its value. Per field id the office lists
 * sources in order (an IfcProject / IfcSite / IfcBuilding attribute, a
 * property, the OwnerHistory, an actor assigned a role) and the first that
 * has a value wins; a value typed for the field beats every source. A field
 * without a configured list reads its default.
 *
 * The map is keyed by field id, so a field added to `TITLE_BLOCK_FIELDS`
 * (the Romanian title block, #54) takes a default here and needs no other
 * code: the resolver, the saved mapping and the form all iterate the ids.
 * The source shape (`kind: 'attribute' | 'pset'`) is the tag fields' one, so
 * the two can share a resolver once both are on main.
 *
 * Pure: the model comes in through `ModelFacts` (`title-block-model.ts`).
 */

export const MODEL_ENTITIES = ['IfcProject', 'IfcSite', 'IfcBuilding'] as const;
export type ModelEntity = (typeof MODEL_ENTITIES)[number];

/** What OwnerHistory names: the owning user's organisation or person, and the authoring application with its developer. */
export const OWNER_PARTS = ['organisation', 'person', 'application', 'developer'] as const;
export type OwnerPart = (typeof OWNER_PARTS)[number];

export type TitleSource =
  /** An attribute of the entity: Name, LongName, Phase, Description, SiteAddress, BuildingAddress, LandTitleNumber. */
  | { kind: 'attribute'; on: ModelEntity; name: string }
  /** A property of a set on the entity, or on the first of project, site and building that has it. */
  | { kind: 'pset'; pset: string; property: string; on?: ModelEntity }
  | { kind: 'owner'; part: OwnerPart }
  /** The actor assigned to the project (IfcRelAssignsToActor) with this role (IfcActorRole). */
  | { kind: 'actor'; role: string }
  /** The name of the model's file, tidied: the project name of a model that carries no IFC project (glTF, LandXML, point cloud). */
  | { kind: 'file' };

export type TitleSources = Record<string, TitleSource[]>;

/** What the model can be asked. Each answer is the text as stored, '' when the model has none. */
export interface ModelFacts {
  attribute(on: ModelEntity, name: string): string;
  property(on: ModelEntity | undefined, pset: string, property: string): string;
  owner(part: OwnerPart): string;
  actor(role: string): string;
  /** The loaded file's name as a project name; '' when the model has an IFC project (it names itself) or none is loaded. Absent reads as ''. */
  file?(): string;
}

const FILE_EXTENSION = /\.(ifc|ifcx|ifczip|ifcxml|glb|gltf|xml|landxml|las|laz|e57|ply|pcd|xyz|pts|ptx|obj|stl|json|zip)$/i;

/** A file name as a project name: no extension, separators read as spaces ("hello_wall-v2.glb" is "hello wall v2"). */
export function projectNameFromFile(fileName: string): string {
  return fileName.trim().replace(FILE_EXTENSION, '').replace(/[_\-\s]+/g, ' ').trim();
}

/** The fields of `fields` that print nothing: nothing typed and no source has a value. The person has to type these. */
export function fieldsWithoutSource<F extends string>(fields: readonly F[], resolved: Record<string, ResolvedField>): F[] {
  return fields.filter((f) => !resolved[f]?.value);
}

const attr = (on: ModelEntity, name: string): TitleSource => ({ kind: 'attribute', on, name });

/**
 * The sources a field reads when the office has not chosen: what a title block of this kind usually carries.
 * Drawn by and Client have none: the OwnerHistory user is often an exporter account rather than the person who
 * drew the sheet, and a project made before the title block read the model must print what it printed. They read
 * the model only once someone picks a source for them.
 */
export const DEFAULT_SOURCES: Readonly<Record<string, readonly TitleSource[]>> = {
  // The file name comes last and only answers for a model without an IFC project, so an IFC title block reads what it always did.
  project: [attr('IfcProject', 'LongName'), attr('IfcProject', 'Name'), { kind: 'file' }],
  address: [attr('IfcSite', 'SiteAddress'), attr('IfcBuilding', 'BuildingAddress')],
  organisation: [{ kind: 'owner', part: 'organisation' }],
};

/** The sources the picker offers for any field, in the order shown. */
export const PRESET_SOURCES: readonly TitleSource[] = [
  attr('IfcProject', 'Name'), attr('IfcProject', 'LongName'), attr('IfcProject', 'Phase'), attr('IfcProject', 'Description'),
  attr('IfcSite', 'Name'), attr('IfcSite', 'SiteAddress'), attr('IfcSite', 'LandTitleNumber'),
  attr('IfcBuilding', 'Name'), attr('IfcBuilding', 'BuildingAddress'),
  { kind: 'owner', part: 'organisation' }, { kind: 'owner', part: 'person' }, { kind: 'owner', part: 'application' }, { kind: 'owner', part: 'developer' },
  { kind: 'actor', role: 'CLIENT' }, { kind: 'actor', role: 'ARCHITECT' },
];

/** Placeholder names authoring tools write where nobody was named; printing them would be wrong. */
const PLACEHOLDER = /^(nicht definiert|not defined|undefined|unknown|unnamed|n\/a|none|-+)$/i;
export const isPlaceholder = (value: string): boolean => PLACEHOLDER.test(value.trim());

export function sourceText(s: TitleSource): string {
  switch (s.kind) {
    case 'attribute': return `${s.on}.${s.name}`;
    case 'pset': return `${s.on ? `${s.on}.` : ''}${s.pset}.${s.property}`;
    case 'owner': return `OwnerHistory.${s.part}`;
    case 'actor': return `Actor.${s.role}`;
    case 'file': return 'File.name';
  }
}

export const sameSource = (a: TitleSource, b: TitleSource): boolean => sourceText(a) === sourceText(b);

/** The sources a field reads: the office's list, else the default. An empty list is an answer too: the field reads nothing. */
export function sourcesOf(custom: TitleSources | undefined, field: string): readonly TitleSource[] {
  return custom?.[field] ?? DEFAULT_SOURCES[field] ?? [];
}

function read(s: TitleSource, facts: ModelFacts): string {
  switch (s.kind) {
    case 'attribute': return facts.attribute(s.on, s.name);
    case 'pset': return facts.property(s.on, s.pset, s.property);
    case 'owner': return facts.owner(s.part);
    case 'actor': return facts.actor(s.role);
    case 'file': return facts.file?.() ?? '';
  }
}

export interface ResolvedField {
  value: string;
  /** `typed`: the person's value. `model`: read from `source`. `none`: nothing typed and the model is silent. */
  from: 'typed' | 'model' | 'none';
  source?: TitleSource;
}

/** One field: the typed value, else the first source with a value. */
export function resolveField(field: string, typed: Record<string, string> | undefined, custom: TitleSources | undefined, facts: ModelFacts): ResolvedField {
  const own = typed?.[field];
  if (own) return { value: own, from: 'typed' };
  for (const source of sourcesOf(custom, field)) {
    const value = read(source, facts).trim();
    if (value && !isPlaceholder(value)) return { value, from: 'model', source };
  }
  return { value: '', from: 'none' };
}

/** Every field in `fields`. */
export function resolveTitleBlock(fields: readonly string[], typed: Record<string, string> | undefined, custom: TitleSources | undefined, facts: ModelFacts): Record<string, ResolvedField> {
  return Object.fromEntries(fields.map((f) => [f, resolveField(f, typed, custom, facts)]));
}

/** What every sheet prints for the project: the typed record (logo and the like) with each field's resolved value on top. */
export function effectiveFields(resolved: Record<string, ResolvedField>, typed: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = { ...typed };
  for (const [field, r] of Object.entries(resolved)) {
    if (r.value) out[field] = r.value;
    else delete out[field];
  }
  return out;
}

/** `custom` with one field's sources set; the default removes the entry, so the mapping holds only what differs. */
export function withSources(custom: TitleSources | undefined, field: string, sources: readonly TitleSource[] | undefined): TitleSources | undefined {
  const next: TitleSources = { ...custom };
  const dflt = DEFAULT_SOURCES[field] ?? [];
  const same = !sources || (sources.length === dflt.length && sources.every((s, i) => sameSource(s, dflt[i])));
  if (same) delete next[field];
  else next[field] = [...sources];
  return Object.keys(next).length ? next : undefined;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v !== '';
const entityOf = (v: unknown): ModelEntity | undefined => MODEL_ENTITIES.find((e) => e === v);

function readSource(v: unknown): TitleSource | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const on = entityOf(s.on);
  if (s.kind === 'attribute' && on && isText(s.name)) return { kind: 'attribute', on, name: s.name };
  if (s.kind === 'pset' && isText(s.pset) && isText(s.property)) return { kind: 'pset', pset: s.pset, property: s.property, ...(on ? { on } : {}) };
  if (s.kind === 'owner') { const part = OWNER_PARTS.find((p) => p === s.part); return part ? { kind: 'owner', part } : null; }
  if (s.kind === 'file') return { kind: 'file' };
  if (s.kind === 'actor' && isText(s.role)) return { kind: 'actor', role: s.role };
  return null;
}

/** The saved mapping: lists of sources by field id; entries that are not sources are dropped, a list that is empty stays (it says the field reads nothing). */
export function readTitleSources(v: unknown): TitleSources | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const out: TitleSources = {};
  for (const [field, list] of Object.entries(v)) {
    if (Array.isArray(list)) out[field] = list.map(readSource).filter((s): s is TitleSource => s !== null);
  }
  return Object.keys(out).length ? out : undefined;
}
