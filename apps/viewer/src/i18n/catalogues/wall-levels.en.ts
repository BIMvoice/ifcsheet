/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The Levels section of the project drawer: levels for a model that has no storeys (`project/user-levels.ts`). */
export const wallLevelsEn = {
  'wall.levels.title': 'Levels',
  'wall.levels.hint': 'This model has no storeys. Add the levels (a name and the height of the floor) and each one gets a plan.',
  'wall.levels.name': 'Level name',
  'wall.levels.elevation': 'Floor height, m',
  'wall.levels.add': 'Add level',
  'wall.levels.detect': 'Find from the model',
  'wall.levels.defaultName': 'Level {n}',
} as const satisfies Record<string, TranslationValue>;
