/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Romanian (#53): the IfcSheet face, i.e. the Wall, the project drawer, the
 * sheet cards, the title block, the scales and the tool rail, plus the
 * checks, issue and what-changed panels the Wall opens, the names it gives
 * what it creates, and the privacy notice. The 3D viewer
 * around it stays English until its catalogues are translated; a key
 * missing here falls back to English one by one. Term choices: `../ro-glossary.md`.
 */
import type { Catalogue } from '../registry';
import { checkRo } from '../catalogues/check.ro';
import { faceRo } from '../catalogues/face.ro';
import { namesRo } from '../catalogues/names.ro';
import { issueRo } from '../catalogues/issue.ro';
import { sheetContentRo } from '../catalogues/sheet-content.ro';
import { sheetsRo } from '../catalogues/sheets.ro';
import { wallRo } from '../catalogues/wall.ro';
import { whatChangedRo } from '../catalogues/whatchanged.ro';
import { featuresRo } from '../catalogues/features.ro';
import { titleBlockSourcesRo } from '../catalogues/title-block-sources.ro';
import { wallLevelsRo } from '../catalogues/wall-levels.ro';
import { revisionsRo } from '../catalogues/revisions.ro';
import { catalogueRo } from '../catalogues/catalogue.ro';
import { cadLayersRo } from '../catalogues/cad-layers.ro';
import { titleBlockParamsRo } from '../catalogues/title-block-params.ro';

export default {
  ...wallRo,
  ...sheetsRo,
  ...checkRo,
  ...issueRo,
  ...whatChangedRo,
  ...sheetContentRo,
  ...namesRo,
  ...faceRo,
  ...featuresRo,
  ...titleBlockSourcesRo,
  ...wallLevelsRo,
  ...revisionsRo,
  ...catalogueRo,
  ...cadLayersRo,
  ...titleBlockParamsRo,
} satisfies Catalogue;
