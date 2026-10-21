/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-levels.en.ts`. Term choices: `../ro-glossary.md`. */
export const wallLevelsRo = {
  'wall.levels.title': 'Niveluri',
  'wall.levels.hint': 'Acest model nu are niveluri. Adăugați nivelurile (un nume și cota pardoselii) și fiecare primește un plan.',
  'wall.levels.name': 'Numele nivelului',
  'wall.levels.elevation': 'Cota pardoselii, m',
  'wall.levels.add': 'Adaugă nivel',
  'wall.levels.detect': 'Caută în model',
  'wall.levels.defaultName': 'Nivel {n}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
