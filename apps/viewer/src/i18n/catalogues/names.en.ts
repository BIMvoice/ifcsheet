/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ENGINE_NAMES_EN } from '@bimvoice/ifcsheet/names';
import type { TranslationValue } from '../types';

/**
 * Names the app gives things it creates: the starting set's sheets, the
 * default views, a section or a detail, an untitled project. Resolved once,
 * when the item is created, and stored as plain text: a stored name is never
 * translated again, so a project made in one language reads the same in
 * another.
 */
export const namesEn = {
  // The names the drawing-set engine gives what it makes; its English is the one copy (`@bimvoice/ifcsheet` `names.ts`).
  ...ENGINE_NAMES_EN,
  'names.view.detail': 'Detail {number} - {source}',
  'names.scan.level': 'Level {n}',
  'names.scan.sectionAlongX': 'Through the scan, west to east',
  'names.scan.sectionAlongZ': 'Through the scan, north to south',
} as const satisfies Record<string, TranslationValue>;
