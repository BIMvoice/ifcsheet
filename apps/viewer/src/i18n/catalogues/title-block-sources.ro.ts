/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `title-block-sources.en.ts`. Term choices: `../ro-glossary.md`. */
export const titleBlockSourcesRo = {
  'wall.tbsrc.typed': 'introdus manual',
  'wall.tbsrc.from': 'din {source}',
  'wall.tbsrc.none': 'nu există în model',
  'wall.tbsrc.pick': 'Preluați {field} din',
  'wall.tbsrc.default': 'Implicit',
  'wall.tbsrc.noSource': 'Nimic (lăsați necompletat)',
  'wall.tbsrc.property': 'O proprietate…',
  'wall.tbsrc.propertyPath': 'Proprietate a câmpului {field} (Pset.Property)',
  'wall.tbsrc.reset': 'Revenire la model',
  'wall.tbsrc.owner.organisation': 'Istoricul proprietarului: organizație',
  'wall.tbsrc.owner.person': 'Istoricul proprietarului: persoană',
  'wall.tbsrc.owner.application': 'Istoricul proprietarului: aplicație',
  'wall.tbsrc.owner.developer': 'Istoricul proprietarului: dezvoltatorul aplicației',
  'wall.tbsrc.actor': 'Actor cu rolul {role}',
  'wall.tbsrc.ownerShort': 'istoricul proprietarului, {part}',
  'wall.tbsrc.actorShort': 'actor {role}',
  'wall.tbsrc.file': 'numele fișierului',
  'wall.tb.missing': 'Acest fișier nu conține date de proiect, deci nimic nu completează {fields}. Introduceți-le manual.',
  'sheets.tb.address': 'Adresă',
  'sheets.tb.organisation': 'Organizație',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
