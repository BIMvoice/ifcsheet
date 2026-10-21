/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TitleSource } from './title-block-sources';
import type { TitleBlockParam } from './title-block-params';
import type { TitleBlockTemplate } from './title-block-template';
import type { ModelSnapshot } from '@/whatchanged/snapshot';
import type { PhaseSource } from './phases';
import type { UrbanSettings } from '@/urban/indicators';
import type { JoineryMapping } from '@/joinery/symbol-mapping';
import type { JoinerySpec, StructureProfile } from '@ifc-lite/create';
import type { ElementTypeKind, ElementTypeSpec } from '@/element-types/spec';
import type { DimStyle, LayerGroup, TextStyle } from '@/drafting/styles';
import type { AnnotationType, DraftSymbol, LibraryDetail, ProjectLegend } from '@/catalogue/types';
import type { TagFieldConfig } from '@/tagfields/tag-fields';
import type { CadLayerRule } from './cad-layers';
import type { DraftEntity, DraftLayer } from '@/drafting/types';
import type { ProjectIssue } from '@/issue/types';
import type { ReviewComment } from '@/review/types';
import type { ProjectCivilDrawing, ProjectMaterial, ProjectTypicalSection, SavedSectionCut } from './project-records';
import type { ProjectDocument as EngineDocument, NumberingScheme, ProjectView, SheetTemplate, TemplateSeries } from '@bimvoice/ifcsheet';

/**
 * The project document: the views and sheets a user organises over the
 * loaded models, Revit/ArchiCAD style. A view is a persistent project
 * object; opening one only points the live section / camera at it. The
 * whole document round-trips through the `.ifclite-project.json` sidecar
 * file kept next to the IFC files (`project-file.ts`).
 *
 * The drawing-set part (levels, views, sheets, numbering, templates) is the
 * engine's contract and is defined in `@bimvoice/ifcsheet`; this module
 * re-exports it and adds what only the app keeps.
 */

export type {
  AxonometricPreset, CategoryGraphics, CategoryLineWeight, CustomPaper, DraftingProjectView, ElevationDirection, ElevationProjectView,
  ElongatedPaper, GridEnds, GroupPattern, InteriorElevation, NumberGroup, NumberingScheme, Paper, PaperSize, PhaseId, PhaseStyle,
  PlanProjectView, ProjectLevel, ProjectModelRef, ProjectSheet, ProjectView, ProjectViewBase, ProjectViewKind, SectionProjectPlane,
  SectionProjectView, SheetFrame, SheetTemplate, SheetViewport, TemplateSeries, ThreeDProjection, ThreeDProjectView, TitleBlockPosition,
  UserLevel, ViewDetail, ViewGraphics, ViewGridGraphics, ViewPhases, ViewRaster,
} from '@bimvoice/ifcsheet';
export type { ProjectCivilDrawing, ProjectMaterial, ProjectTypicalSection, SavedSectionCut, SavedSectionCutPlane } from './project-records';

/** A view as handed to `addProjectView`: the store assigns `createdAt` (and `id` unless given). */
export type NewProjectView = ProjectView extends infer V
  ? V extends ProjectView ? Omit<V, 'id' | 'createdAt'> & { id?: string } : never
  : never;

/** A settings change for one view kind (`updateProjectView`); id and kind never change. */
export type ProjectViewPatch = ProjectView extends infer V
  ? V extends ProjectView ? Partial<Omit<V, 'id' | 'kind'>> : never
  : never;

/** A joinery schedule (door / window list): a project document of its own, placeable on sheets. */
export interface ProjectSchedule {
  id: string;
  name: string;
  /** What it lists: doors and windows (joinery), the materials with their quantities (a takeoff), the quantities by element type, the finishes of each room, the set's own sheets (the drawing register, derived from the sheets on every draw), or the permit's areas and urban indicators (`urban/`). */
  kind: 'door' | 'window' | 'all' | 'materials' | 'types' | 'finishes' | 'register' | 'urban';
  createdAt: number;
  /** Scale of its drawings (50 = 1:50). */
  scale?: number;
}

export interface ProjectDocument extends EngineDocument {
  /** Title block fields every sheet prints (project, client, drawn by, date, revision, logo…), filled once (`title-block.ts`). */
  titleBlock?: Record<string, string>;
  /** Where each title block field reads its value in the model, by field id; a field not listed reads its default (`title-block-sources.ts`). */
  titleBlockSources?: Record<string, TitleSource[]>;
  /** The project's revisions, oldest first (`revisions.ts`); a sheet's table lists the ones it is named by. */
  revisions?: ProjectRevision[];
  /** The user's own title block parameters, in order, each with its project-wide value (`title-block-params.ts`). */
  titleBlockParams?: TitleBlockParam[];
  /** The title block's layout once edited; absent: the standard layout (`title-block-template.ts`). */
  titleBlockTemplate?: TitleBlockTemplate;
  /** Drafted geometry, each entity on one view (phase 4). */
  drafts: DraftEntity[];
  draftLayers: DraftLayer[];
  /** User-imported hatch patterns, as `.pat` text (built-ins are not stored). */
  hatchPatterns?: string;
  /** Drafting standards: text and dimension styles, and the groups layers are filed in. */
  textStyles?: TextStyle[];
  dimStyles?: DimStyle[];
  layerGroups?: LayerGroup[];
  /** The built-in graphic standard (pens and text sizes) the sheets draw with, by id (`drafting/graphic-standard.ts`); absent: the IfcSheet default. */
  graphicStandard?: string;
  /** Door and window opening symbols in elevation: apex at the handle (default, window makers' sketches) or at the hinges (DIN 1356). */
  openingLines?: 'handle' | 'hinge';
  /** Plan symbol overrides by element GlobalId: bit 1 hinges a door on its other jamb, bit 2 swings it to the other side. */
  symbolFlips?: Record<string, number>;
  /** The project's door and window types (the configurator's catalogue); each is one IFC type per model it is placed in. */
  joineryTypes?: JoinerySpec[];
  /** The catalogue entry the Door / Window tools place, per kind. */
  currentJoinery?: { door?: string; window?: string };
  /** Which catalogue entry draws the doors and windows a model does not type itself (`joinery/symbol-mapping.ts`). */
  joineryMapping?: JoineryMapping;
  /** The project's wall, slab, column, beam, roof and opening types; each is one IFC type per model it is used in. */
  elementTypes?: ElementTypeSpec[];
  /** The entry each Design tool builds with, per kind. */
  currentTypes?: Partial<Record<ElementTypeKind, string>>;
  schedules?: ProjectSchedule[];
  /** The project's own sheet templates (the built-in ones are in code, `sheet-templates.ts`); they travel in the library file. */
  sheetTemplates?: SheetTemplate[];
  /** The template new sheets of a series start from, by template id; a series without one is made on the smallest paper that fits. */
  seriesTemplates?: Partial<Record<TemplateSeries, string>>;
  /** The site (plot) area in m² the user entered; absent: the model's IfcSite area, if it states one (`urban/`). */
  siteArea?: number;
  /** The urban indicators' terrain level, ±0.00 and the storeys left out of Ad for CUT (`urban/indicators.ts`). */
  urbanSettings?: UrbanSettings;
  /** The project's structure profile library (retaining walls, tunnels, decks, barriers… and drawn shapes). */
  structureProfiles?: StructureProfile[];
  /** Road drawings: longitudinal profiles and cross-section sets. */
  civilDrawings?: ProjectCivilDrawing[];
  /** Typical road cross-sections (assemblies) corridors take from. */
  typicalSections?: ProjectTypicalSection[];
  /** Building materials: how each IfcMaterial draws where it is cut. */
  materials?: ProjectMaterial[];
  /** The CAD layer standard: which DXF layer (name, colour, pen, line type) an IFC class or material goes on (`cad-layers.ts`). */
  cadLayers?: CadLayerRule[];
  /** Named section cuts of the Drawing panel. */
  savedSectionCuts?: SavedSectionCut[];
  /** Where an element's phase is read from besides its IFC Status (`phases.ts`). */
  phaseSource?: PhaseSource;
  /** Named presets of the annotation tools. */
  annotationTypes?: AnnotationType[];
  /** The project's own symbols (the built-in ones are in code). */
  symbols?: DraftSymbol[];
  /** Details drawn once and kept for reuse: drafting views saved to the library, placed again with `placeLibraryDetail`. */
  details?: LibraryDetail[];
  /** Legends: generated tables of what the drawings use, placeable on sheets. */
  legends?: ProjectLegend[];
  /** Which IFC property feeds each field of a tag, per tag kind (`tagfields/tag-fields.ts`); only what differs from the defaults. */
  tagFields?: TagFieldConfig;
  /** The sets of sheets that were issued, oldest first (`issue/plan.ts`). */
  issues?: ProjectIssue[];
  /** How sheets are numbered (`numbering.ts`); absent is the default A-101 style. Document key: `sheetNumbering`. */
  sheetNumbering?: NumberingScheme;
  /** The model as the project last knew it: what a new version is compared with (`whatchanged/`). */
  modelState?: ModelSnapshot;
  /** Review comments pinned on sheets (`review/`). */
  comments?: ReviewComment[];
}

/** One revision of the set: a letter or number, when, what changed, who made it. */
export interface ProjectRevision {
  id: string;
  /** `A`, `B`, `01`: what the title block reads. */
  code: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  description: string;
  by: string;
}

// The issue records live with the issue code; re-exported so the document's types stay in one import.
export type { IssuedSheet, ProjectIssue } from '@/issue/types';
