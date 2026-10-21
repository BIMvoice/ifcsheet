/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the names the app gives what it creates (`names.en.ts`). Term choices: `../ro-glossary.md`. */
export const namesRo = {
  'names.project.untitled': 'Proiect fără titlu',
  'names.sheet.plans': 'Planuri',
  'names.sheet.plansN': 'Planuri {n}',
  'names.sheet.elevations': 'Fațade',
  'names.sheet.interiors': 'Fațade interioare',
  'names.sheet.elevationsSouthNorth': 'Fațade sud și nord',
  'names.sheet.elevationsEastWest': 'Fațade est și vest',
  'names.sheet.sections': 'Secțiuni',
  'names.sheet.sectionsN': 'Secțiuni {n}',
  'names.sheet.schedules': 'Tabele',
  'names.view.plan': 'Plan',
  'names.view.north': 'Fațada nord',
  'names.view.east': 'Fațada est',
  'names.view.south': 'Fațada sud',
  'names.view.west': 'Fațada vest',
  'names.view.section': 'Secțiunea {mark}-{mark}',
  'names.view.detail': 'Detaliu {number} - {source}',
  'names.scan.level': 'Nivelul {n}',
  'names.scan.sectionAlongX': 'Prin scanare, de la vest la est',
  'names.scan.sectionAlongZ': 'Prin scanare, de la nord la sud',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
