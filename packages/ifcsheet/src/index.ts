/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @bimvoice/ifcsheet: the IfcSheet drawing-set engine.
 *
 * The project document's drawing-set part is the contract (`document.ts`).
 * The pure layout makes a set from views and a model's extent; the headless
 * chain opens an IFC, lays out the starting set and writes it as PDF and DXF,
 * in Node or in the browser. The web app (`apps/viewer`) is a client: its
 * stores call into these functions and keep the UI state.
 *
 *     import { generateDefaultSet } from '@bimvoice/ifcsheet';
 *     import { exportDxf, exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';
 *
 *     const model = await openModel(bytes);
 *     const set = generateDefaultSet(model);
 *     const sheets = await sheetGraphics(set, model);
 *     const pdf = await exportPdf(sheets);
 *     const dxf = sheets.map(exportDxf);
 */

// The document
export type {
  AxonometricPreset, CameraViewpoint, CategoryGraphics, CategoryLineWeight, CustomPaper, DisciplineId, DraftingProjectView,
  ElevationDirection, ElevationProjectView, ElongatedPaper, GridEnds, GroupPattern, InteriorElevation, NumberGroup, NumberingScheme,
  Paper, PaperSize, PhaseId, PhaseStyle, PlanProjectView, ProjectDocument, ProjectionMode, ProjectLevel, ProjectModelRef, ProjectSheet,
  ProjectView, ProjectViewBase, ProjectViewKind, SectionCustomPlane, SectionPlaneAxis, SectionProjectPlane, SectionProjectView,
  SheetFrame, SheetTemplate, SheetViewport, TemplateSeries, ThreeDProjection, ThreeDProjectView, TitleBlockPosition, UserLevel, ViewDetail,
  ViewGraphics, ViewGridGraphics, ViewPhases, ViewRaster,
} from './document.js';

// Names
export { ENGINE_NAMES_EN, englishName, nameOf, setNameResolver, type EngineNameKey, type NameParams, type NameResolver } from './names.js';

// Pure layout
export { freshProjectId } from './ids.js';
export { CUSTOM_MM, ELONGATED_MM, ELONGATED_PAPERS, ISO_PAPERS, PAPER_MM, isCustom, isElongated, paperFromLabel, paperLabel, paperMm, readPaper } from './paper.js';
export { DEFAULT_FRAME, FRAME_MARGIN_MM, MARGIN_MM, TITLE_BLOCK_MM, drawingAreaIn, frameOf, frameProblem, frameRect, readFrame, titleBlockRect, type FrameProblem, type Rect } from './sheet-frame.js';
export { BUILT_IN_TEMPLATES, FILING_MARGIN_MM, allTemplates, findTemplate, readSeriesTemplates, readTemplate, templateFields, templateFromSheet } from './sheet-templates.js';
export {
  DEFAULT_SCHEME, NUMBER_GROUPS, SCHEME_PRESETS, SEQUENTIAL_SCHEME, formatNumber, nextNumber, numberAt, numberGroupOf, numberSheets, planRenumber,
  readNumberingScheme, registerNumberIn, registerSlot, renumbered, typedBeforeSchemes, type OverrideMode, type RenumberRow,
} from './numbering.js';
export { SHEET_SCALES, fitViewportBox, mmPerMetre, paperOf } from './viewport-fit.js';
export {
  DEFAULT_PLAN_CUT_HEIGHT_M, ELEVATION_DIRECTIONS, LEVEL_MATCH_TOLERANCE_M, defaultViews, elevationName, levelFloorY, levelsFromStoreys, levelsWithUser, planCutHeight, planViewFor,
  resolvePlanLevel, sameElevation, syncDefaultViews, uniqueViewName, type StoreyInput,
} from './view-defaults.js';
export { DEPTH_MARGIN_M, ELEVATION_INSET_M, elevationDepth, elevationPlaneOffset, proposalDepth, type Extent3 } from './set-defaults.js';
export { CUT_OVERHANG_M, SAME_CUT_M, SMALLEST_ROOM_M2, proposeSections, type Footprint, type ProposalInput, type RoomFootprint, type SectionProposal } from './section-proposals.js';
export { customPlaneCenter, sectionPlaneThrough, type WorldPoint } from './section-plane.js';
export {
  PER_SHEET, SET_PAPER, SET_PAPERS, SET_SCALES, TARGET_SCALE, buildDrawingSet, choosePaper, detailedScaleThatFits, drawingArea, fitsScale, fittingScale,
  groundPlan, groupOfView, groupsThatDoNotFit, isSetSheet, overrun, placeViewports, scaleOn, sheetGroup, sheetScaleReason, sheetSeries, viewExtent,
  withViewHung, type Arrangement, type ModelExtent, type Reason, type SetGroup, type SetInput, type SheetLayout,
} from './drawing-set.js';
export { boundsFromIndex, createEntityBoundsLookup, getEntityBounds, indexMeshesByEntity, isValidCoord, unionEntityBounds, type BoundingBox3D, type Point3D } from './entity-bounds.js';

// The starting set (pure: an opened model's facts in, a document out)
export { SET_SECTIONS, generateDefaultSet, type DefaultSet, type DefaultSetOptions, type SetModel, type SetNote } from './default-set.js';

// Opening an IFC, cutting drawings and writing files live in `@bimvoice/ifcsheet/headless` (`headless.ts`),
// so a client of the layout alone (the web app) does not load the parser, the geometry engine or the writers through it.
