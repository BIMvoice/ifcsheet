/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project document's drawing-set part: the views, the sheets they hang
 * on and the levels plans are cut on. This is the contract between the
 * engine and every client of it (the web app, scripts, agents): the engine
 * reads and writes these shapes and nothing else. The app's full document
 * (`ProjectDocument` in `apps/viewer/src/project/types.ts`) extends
 * {@link ProjectDocument} here with what only the app keeps (drafts, styles,
 * issues and the rest). It round-trips as JSON.
 */

import type { ViewGraphics } from './view-graphics-types.js';
import type { ThreeDProjectView } from './view-3d-types.js';
import type { Paper, SheetFrame, SheetTemplate, TemplateSeries } from './sheet-types.js';

export type { CategoryGraphics, CategoryLineWeight, GridEnds, PhaseId, PhaseStyle, ViewGraphics, ViewGridGraphics, ViewPhases } from './view-graphics-types.js';
export type { AxonometricPreset, CameraViewpoint, ProjectionMode, ThreeDProjection, ThreeDProjectView, ViewRaster } from './view-3d-types.js';
export type { CustomPaper, ElongatedPaper, Paper, SheetFrame, SheetTemplate, TemplateSeries, TitleBlockPosition } from './sheet-types.js';

/** The ISO A-series sheet sizes. */
export type PaperSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';

/** The axis a cardinal section plane is perpendicular to: `down` cuts a plan, `front` and `side` cut vertically. */
export type SectionPlaneAxis = 'down' | 'front' | 'side';

/** The disciplines a plan can be drawn for (`discipline-views.ts` in the app). */
export type DisciplineId = 'structural' | 'foundation' | 'roof';

/**
 * A section plane of any direction, world metres in the viewer frame (Y up):
 * `dot(p, normal) = distance`. Tangent and bitangent are the in-plane axes the
 * drawing's x and y follow.
 */
export interface SectionCustomPlane {
  /** Unit world-space normal. */
  normal: [number, number, number];
  /** Signed plane offset in world units: `dot(pointOnPlane, normal)`. */
  distance: number;
  /** World-space point the plane was picked or drawn through. */
  pickedAt: [number, number, number];
  /** First in-plane axis. */
  tangent: [number, number, number];
  /** Second in-plane axis. */
  bitangent: [number, number, number];
}

export type ProjectViewKind = 'plan' | 'section' | 'elevation' | '3d' | 'drafting';

/** The facade an elevation looks at (project north = IFC +Y). */
export type ElevationDirection = 'north' | 'south' | 'east' | 'west';

/** A building level, merged across federated models at the same elevation. */
export interface ProjectLevel {
  name: string;
  /** Floor elevation, metres: the storeys' IfcBuildingStorey.Elevation, what levels are matched and named by. */
  elevation: number;
  /** IfcBuildingStorey GlobalIds (one per model that has this level). */
  storeyGlobalIds: string[];
  /**
   * The floor in the drawing frame (render Y: the storey's placement-chain Z less the RTC offset and origin
   * shift the meshes were moved by), derived from the loaded models and never saved. Absent: `elevation`.
   * Read through `levelFloorY`.
   */
  floorY?: number;
}

/**
 * A level the user defined for a model that has no storeys (a glTF/GLB): a name and the floor's height in the
 * drawing frame, metres (the model's up axis). It becomes a {@link ProjectLevel} with no storey GlobalIds
 * (`levelsWithUser`), and so a plan. Never read from the model, so it is saved with the project.
 */
export interface UserLevel {
  id: string;
  name: string;
  /** Floor height, metres, in the frame the model is drawn in. */
  elevation: number;
}

export interface ProjectViewBase {
  id: string;
  name: string;
  /** Created by the default-view generator rather than the user. */
  auto?: boolean;
  createdAt: number;
  /**
   * View depth: how far beyond the cut plane the view sees, metres. `null`
   * or absent is the view kind's default — a plan shows the cut only, a
   * section / elevation projects with the automatic depth bands.
   */
  viewDepth?: number | null;
  /**
   * Draw the lines that are hidden behind other geometry, dashed. Absent:
   * an elevation does not (it shows what is seen from outside), every other
   * view does.
   */
  showHidden?: boolean;
  /**
   * Set on a detail view: the area of its source view it shows, in the source's
   * drawing metres. The detail is otherwise a copy of its source (same cut,
   * same depth), shown at a larger scale and cropped to `min`..`max`.
   */
  detail?: ViewDetail;
  /** The view's own graphics (Visibility / Graphics): a preset and per-category overrides. */
  graphics?: ViewGraphics;
  /** Drawing scale denominator (100 = 1:100). Annotation sizes follow it; absent = 1:100. */
  scale?: number;
  /** Drafting layers this view hides (by id), over their own switches. */
  hiddenLayers?: string[];
}

/** The area a detail view shows of its source view. */
export interface ViewDetail {
  /** The view the area was marked on. */
  of: string;
  /** Corners of the area, drawing metres, `min` below and left of `max`. */
  min: { x: number; y: number };
  max: { x: number; y: number };
  /** The detail's number (1, 2, …), unique among the project's details. */
  number: number;
}

export interface PlanProjectView extends ProjectViewBase {
  kind: 'plan';
  level: ProjectLevel;
  /** Cut height above the level's floor, metres. */
  cutHeight: number;
  /** The site plan: the ground storey's cut with the plot, setbacks and coordinates on it (`siteplan/`). */
  site?: true;
  /** A discipline plan (structural, foundation, roof): it draws only the elements its discipline keeps (`discipline-views.ts`). */
  discipline?: DisciplineId;
  /**
   * A reflected ceiling plan: the same plan, looking up from the cut. It keeps
   * the floor plan's x/y (a point sits where it does in the plan below) and
   * draws what is above the cut: ceilings, soffits, lights, beams.
   */
  reflected?: boolean;
}

/** A section cut stored in world metres, independent of the model bounds. */
export interface SectionProjectPlane {
  axis: SectionPlaneAxis;
  /** World coordinate along the axis, metres (viewer frame). */
  offset: number;
  flipped: boolean;
  custom?: SectionCustomPlane;
}

export interface SectionProjectView extends ProjectViewBase {
  kind: 'section';
  plane: SectionProjectPlane;
  /** What the cut passes through, for people ("Through the stair"); set on proposed sections. */
  through?: string;
}

export interface ElevationProjectView extends ProjectViewBase {
  kind: 'elevation';
  /** The facade it looks at; on an interior elevation, the side of the room its wall is on (it looks that way). */
  direction: ElevationDirection;
  /**
   * World coordinate, metres, of the plane on its axis (z for north and
   * south, x for east and west). Absent: the plane sits just inside the whole
   * model's box on that facade.
   */
  planeOffset?: number;
  /** Set on an interior elevation: one wall of a room, seen from inside it. Its plane replaces `direction` / `planeOffset`. */
  interior?: InteriorElevation;
}

/** One wall face of a room, looked at from inside the room (`interior-elevations.ts`). */
export interface InteriorElevation {
  /** The room's IfcSpace GlobalId. */
  room: string;
  /** Parallel to the wall face, inside the room, looking at the face; world metres like a section's plane. */
  plane: SectionProjectPlane;
  /** The wall face in drawing metres: its length across, the room's floor to its top up. The drawing is cropped to it. */
  crop: { min: { x: number; y: number }; max: { x: number; y: number } };
}

/**
 * A drawing with no model behind it: a scale, a name and the drafts drawn on
 * it (a typical parapet, a threshold). It generates no model geometry, is
 * placed on sheets like any view and can be the target of a detail mark.
 */
export interface DraftingProjectView extends ProjectViewBase {
  kind: 'drafting';
  /** The number a detail mark shows for it (1, 2, …), set when a mark is made; shared with the numbers of the project's details. */
  number?: number;
}

export type ProjectView = PlanProjectView | SectionProjectView | ElevationProjectView | ThreeDProjectView | DraftingProjectView;


/** A view placed on a sheet. Positions and sizes are paper millimetres from the sheet's top-left. */
export interface SheetViewport {
  id: string;
  viewId: string;
  /** Centre of the viewport on the paper. */
  x: number;
  y: number;
  /** Drawing scale denominator: 100 means 1:100. */
  scale: number;
  /** Crop box on the paper; the drawing is clipped to it. 0 × 0 means "fit the drawing". */
  width: number;
  height: number;
  /** Drawing point (metres) shown at the viewport centre; `null` centres the drawing. */
  center: { x: number; y: number } | null;
  /** Drafting layers this viewport hides, on top of its view's. */
  hiddenLayers?: string[];
  /** The page of a document split over several sheets (the drawing register's continuation sheets), from 0; absent is 0. */
  page?: number;
  /** A key plan: the viewport (on the same sheet) whose extent it outlines on the whole plan (`siteplan/key-plan.ts`). */
  keyPlanOf?: string;
  /** The drawing number printed in its title, chosen; absent: numbered 1, 2, 3 … in reading order (`drafting/cross-ref.ts`). */
  drawingNumber?: string;
}

/** The groups of sheets a numbering scheme numbers apart: `other` is details and whatever fits no series. */
export type NumberGroup = 'general' | 'plans' | 'elevations' | 'sections' | 'interiors' | 'details' | 'schedules' | 'other';

/** How one group's numbers are written: `<discipline><prefix><separator><n padded to digits>`, `n` running from `start` by `step`. */
export interface GroupPattern {
  prefix: string;
  separator: string;
  start: number;
  digits: number;
  step: number;
}

/** The project's sheet numbering (`numbering.ts`). */
export interface NumberingScheme {
  /** Printed first on every number: `A` for architecture. */
  discipline: string;
  /** One running sequence through the whole set (A01, A02, …) instead of one per group; the plans pattern then numbers every sheet. */
  continuous: boolean;
  groups: Record<NumberGroup, GroupPattern>;
}

export interface ProjectSheet {
  id: string;
  /** Sheet number as printed in the title block, e.g. "A-101". */
  number: string;
  /**
   * The number was chosen by the program, not typed: it is replaced by the
   * group's next number when the first view is placed. Cleared by then, and
   * by typing a number. Absent on sheets from older files, which are never
   * renumbered.
   */
  autoNumber?: boolean;
  /** The number was typed by hand: a renumbering keeps it unless asked to renumber those too (`numbering.ts`). */
  numberOverride?: boolean;
  /** The number series the sheet belongs to, what it is renumbered by. Absent on older sheets, read back from the number (`numberGroupOf`). */
  series?: NumberGroup;
  name: string;
  createdAt: number;
  paper?: Paper;
  orientation?: 'landscape' | 'portrait';
  /** Frame margins and title block position; absent: 10 mm all round, title block bottom right (`sheet-frame.ts`). */
  frame?: SheetFrame;
  /** The template the sheet was started from (a record of where it came from; the sheet's own paper and frame rule). */
  templateId?: string;
  viewports?: SheetViewport[];
  /** Title block fields this sheet says otherwise than the project's (`ProjectDocument.titleBlock`); a key present wins, even empty. */
  titleBlock?: Record<string, string>;
  /** Revisions this sheet lists besides the ones its clouds name: a manual choice (`ProjectRevision.id`; `revisions.ts`). */
  revisionIds?: string[];
  /** The values this sheet gives title block parameters otherwise than the project's (`title-block-params.ts`); a name present wins. */
  titleBlockParams?: Record<string, string>;
}

/** The identity of a model a project refers to (content hash, else its name). */
export interface ProjectModelRef {
  key: string;
  name: string;
  /** How views draw it (`model-styles.ts`): the host draws as itself, a linked model in its own style. Absent: the first model is the host. */
  role?: 'host' | 'linked';
  /** Absent: the host draws normally, a linked model in halftone. */
  drawStyle?: 'normal' | 'halftone';
}


/**
 * The drawing-set part of a project document: what the engine makes and
 * reads. A project file holds more; the app's document type extends this one.
 */
export interface ProjectDocument {
  name: string;
  models: ProjectModelRef[];
  views: ProjectView[];
  sheets: ProjectSheet[];
  /** Title block fields every sheet prints (project, client, drawn by, date…). */
  titleBlock?: Record<string, string>;
  /** The project's own sheet templates (the built-in ones are in code, `sheet-templates.ts`). */
  sheetTemplates?: SheetTemplate[];
  /** The template new sheets of a series start from, by template id. */
  seriesTemplates?: Partial<Record<TemplateSeries, string>>;
  /** How sheets are numbered (`numbering.ts`); absent is the default A-101 style. */
  sheetNumbering?: NumberingScheme;
  /** The levels the user defined for a model with no storeys; absent or empty: none (`UserLevel`). */
  userLevels?: UserLevel[];
}
