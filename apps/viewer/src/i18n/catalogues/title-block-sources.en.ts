/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
export const titleBlockSourcesEn = {
  'wall.tbsrc.typed': 'typed',
  'wall.tbsrc.from': 'from {source}',
  'wall.tbsrc.none': 'not in the model',
  'wall.tbsrc.pick': 'Take {field} from',
  'wall.tbsrc.default': 'Default',
  'wall.tbsrc.noSource': 'None (leave blank)',
  'wall.tbsrc.property': 'A property…',
  'wall.tbsrc.propertyPath': 'Property of {field} (Pset.Property)',
  'wall.tbsrc.reset': 'Reset to model',
  'wall.tbsrc.owner.organisation': 'Owner history: organisation',
  'wall.tbsrc.owner.person': 'Owner history: person',
  'wall.tbsrc.owner.application': 'Owner history: application',
  'wall.tbsrc.owner.developer': 'Owner history: application developer',
  'wall.tbsrc.actor': 'Actor with role {role}',
  'wall.tbsrc.ownerShort': 'owner history, {part}',
  'wall.tbsrc.actorShort': 'actor {role}',
  'wall.tbsrc.file': 'file name',
  'wall.tb.missing': 'This file has no project data, so nothing fills {fields}. Type them in.',
  'sheets.tb.address': 'Address',
  'sheets.tb.organisation': 'Organisation',
} as const satisfies Record<string, TranslationValue>;
