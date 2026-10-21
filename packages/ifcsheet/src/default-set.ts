/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing set a model starts with, made without a browser: the views the
 * app gives a new project (a plan per level, the four elevations, a 3D view),
 * completed the way the Wall completes them when the model opens (each
 * elevation's plane and depth, each plan's scale, the two proposed sections),
 * then hung on numbered sheets.
 *
 * It follows the Wall's start step by step (`ensureDrawingSet` in
 * `apps/viewer/src/project/drawing-set-actions.ts`) for a project that has no
 * views yet, over the same pure layout (`drawing-set.ts`). The viewer test
 * `project/engine-default-set.fzk.test.ts` runs both on one model and holds
 * them equal.
 */

import { buildDrawingSet, groundPlan, groupsThatDoNotFit, type ModelExtent, type SetGroup } from './drawing-set.js';
import type { ElevationProjectView, NumberingScheme, PlanProjectView, ProjectDocument, ProjectLevel, ProjectView, SectionProjectView, SheetTemplate, TemplateSeries } from './document.js';
import { freshProjectId } from './ids.js';
import { nameOf } from './names.js';
import { DEFAULT_SCHEME } from './numbering.js';
import { proposeSections, type ProposalInput, type SectionProposal } from './section-proposals.js';
import { sectionPlaneThrough } from './section-plane.js';
import { elevationDepth, elevationPlaneOffset, proposalDepth } from './set-defaults.js';
import { ELEVATION_DIRECTIONS, defaultViews, elevationName, levelFloorY, levelsFromStoreys, planCutHeight, resolvePlanLevel, sameElevation, uniqueViewName, type StoreyInput } from './view-defaults.js';

/** How many proposed sections the starting set draws (`SET_SECTIONS` in the app). */
export const SET_SECTIONS = 2;

/** What the set is made from: an opened model, or the same facts from elsewhere. */
export interface SetModel {
  /** The project's name in the model, the document's name when none is given. */
  projectName?: string;
  storeys: readonly StoreyInput[];
  extent: ModelExtent | null;
  proposalInput(level: ProjectLevel): ProposalInput | null;
}

export interface DefaultSetOptions {
  /** The project's name; else the model's (`SetModel.projectName`), else the untitled name in the installed language. */
  name?: string;
  /** Creation time stamped on views and sheets, ms (default: now). */
  now?: number;
  /** The template each series starts its sheets from. */
  templates?: Partial<Record<TemplateSeries, SheetTemplate>>;
  /** The project's numbering (default: A-101 style). */
  scheme?: NumberingScheme;
}

/** Something the person should know about the set, as a catalogue key and its parameters. */
export interface SetNote {
  key: 'draftSet.note.noStoreys' | 'draftSet.note.noFit';
  params: Record<string, string | number>;
}

export interface DefaultSet {
  /** The project document: the views, the sheets they hang on, today's date in the title block. */
  document: ProjectDocument;
  /** The levels the plans are cut on. */
  levels: ProjectLevel[];
  notes: SetNote[];
}

/** The first mark (A, B, … Z, AA …) no section in `views` is named with. */
function nextSectionMark(views: readonly ProjectView[]): string {
  const taken = new Set(views.filter((v) => v.kind === 'section').map((v) => v.name.toLowerCase()));
  for (let i = 0; ; i++) {
    let mark = '';
    for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) mark = String.fromCharCode(65 + (n % 26)) + mark;
    if (!taken.has(nameOf('names.view.section', { mark }).toLowerCase())) return mark;
  }
}

class Planner {
  readonly views: ProjectView[];
  readonly notes: SetNote[] = [];

  constructor(readonly levels: ProjectLevel[], readonly extent: ModelExtent, readonly now: number) {
    this.views = defaultViews(levels, now);
  }

  /** A view as the store adds one (`addProjectView`): a fresh id, a name no other view has, stamped now. */
  private add<V extends ProjectView>(view: Omit<V, 'id' | 'createdAt'>): V {
    const made = { ...view, id: freshProjectId('view'), name: uniqueViewName(view.name, this.views), createdAt: this.now } as V;
    this.views.push(made);
    return made;
  }

  private patch(id: string, patch: Partial<ProjectView>): void {
    const i = this.views.findIndex((v) => v.id === id);
    if (i >= 0) this.views[i] = { ...this.views[i], ...patch } as ProjectView;
  }

  /** One plan per level that has none; a model with no storeys gets one cut at mid-height. */
  plans(): void {
    const levels: ProjectLevel[] = [];
    for (const level of [...this.levels].sort((a, b) => a.elevation - b.elevation)) {
      if (!levels.some((l) => sameElevation(l.elevation, level.elevation))) levels.push(level);
    }
    if (levels.length === 0) {
      if (this.views.some((v) => v.kind === 'plan')) return;
      const height = Math.round(((this.extent.max.y - this.extent.min.y) / 2) * 10) / 10;
      this.notes.push({ key: 'draftSet.note.noStoreys', params: { height } });
      this.add<PlanProjectView>({ kind: 'plan', name: nameOf('names.view.plan'), auto: true, cutHeight: height, level: { name: nameOf('names.view.plan'), elevation: this.extent.min.y, storeyGlobalIds: [] } });
      return;
    }
    for (const level of levels) {
      if (this.views.some((v) => v.kind === 'plan' && sameElevation(v.level.elevation, level.elevation))) continue;
      this.add<PlanProjectView>({ kind: 'plan', name: level.name, cutHeight: planCutHeight(level, levels), level: { name: level.name, elevation: level.elevation, storeyGlobalIds: [...level.storeyGlobalIds] } });
    }
  }

  /** The four elevations, each plane just inside its facade and each seeing through the building. */
  elevations(): void {
    for (const direction of ELEVATION_DIRECTIONS) {
      const found = this.views.find((v): v is ElevationProjectView => v.kind === 'elevation' && v.direction === direction && !v.interior);
      if (!found) {
        this.add<ElevationProjectView>({ kind: 'elevation', name: elevationName(direction), direction, planeOffset: elevationPlaneOffset(direction, this.extent), viewDepth: elevationDepth(direction, this.extent) });
        continue;
      }
      if (found.viewDepth == null) this.patch(found.id, { viewDepth: elevationDepth(direction, this.extent) });
      if (found.planeOffset === undefined) this.patch(found.id, { planeOffset: elevationPlaneOffset(direction, this.extent) });
    }
  }

  /** A plan with no scale of its own takes the one the set will draw it at. */
  planScales(templates: Partial<Record<TemplateSeries, SheetTemplate>>): void {
    const plans = this.views.filter((v): v is PlanProjectView => v.kind === 'plan' && !v.detail);
    const planned = buildDrawingSet({ views: plans, extent: this.extent, templates });
    const scales = new Map(planned.flatMap((s) => (s.viewports ?? []).map((vp) => [vp.viewId, vp.scale] as const)));
    for (const plan of plans) {
      const scale = scales.get(plan.id);
      if (scale !== undefined && plan.scale === undefined) this.patch(plan.id, { scale });
    }
  }

  /** The section the SECTION command would make along a proposal's line on `plan`. */
  private proposedSection(plan: PlanProjectView, proposal: SectionProposal): SectionProjectView | null {
    const y = levelFloorY(resolvePlanLevel(plan, this.levels) ?? plan.level) + plan.cutHeight;
    const custom = sectionPlaneThrough({ x: proposal.a.x, y, z: proposal.a.z }, { x: proposal.b.x, y, z: proposal.b.z }, { x: proposal.side.x, y, z: proposal.side.z });
    if (!custom) return null;
    const name = nameOf('names.view.section', { mark: nextSectionMark(this.views) });
    return this.add<SectionProjectView>({ kind: 'section', name, plane: { axis: 'front', offset: custom.distance, flipped: false, custom }, through: proposal.label });
  }

  /** The proposed sections the set draws, on the lowest plan, each seeing to the far side of the building. */
  sections(model: SetModel): void {
    if (this.views.some((v) => v.kind === 'section')) return;
    const plan = groundPlan(this.views);
    const input = plan ? model.proposalInput(plan.level) : null;
    if (!plan || !input) return;
    for (const proposal of proposeSections(input).slice(0, SET_SECTIONS)) {
      const existing = this.views.find((v): v is SectionProjectView => v.kind === 'section' && v.through === proposal.label);
      const section = existing ?? this.proposedSection(plan, proposal);
      if (section && section.viewDepth == null) this.patch(section.id, { viewDepth: proposalDepth(proposal, this.extent) });
    }
  }
}

/**
 * The starting drawing set for `model`: what the Wall lays out when the model
 * opens on an empty project. `null` when the model has no extent (no
 * geometry): there is nothing to measure the sheets on.
 */
export function generateDefaultSet(model: SetModel, options: DefaultSetOptions = {}): DefaultSet | null {
  if (!model.extent) return null;
  const now = options.now ?? Date.now();
  const templates = options.templates ?? {};
  const levels = levelsFromStoreys(model.storeys);
  const planner = new Planner(levels, model.extent, now);
  planner.plans();
  planner.elevations();
  planner.planScales(templates);
  planner.sections(model);
  const sheets = buildDrawingSet({ views: planner.views, extent: model.extent, now, templates, scheme: options.scheme ?? DEFAULT_SCHEME });
  const notes = [...planner.notes, ...groupsThatDoNotFit(planner.views, model.extent).map((kind: SetGroup): SetNote => ({ key: 'draftSet.note.noFit', params: { kind } }))];
  return {
    document: {
      name: options.name ?? (model.projectName || nameOf('names.project.untitled')),
      models: [],
      views: planner.views,
      sheets,
      titleBlock: { date: new Date(now).toISOString().slice(0, 10) },
      ...(options.scheme ? { sheetNumbering: options.scheme } : {}),
    },
    levels,
    notes,
  };
}
