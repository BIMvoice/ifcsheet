/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leftTabFrom } from './left-tab';

test('the left panel opens on Project when nothing was chosen before', () => {
  assert.equal(leftTabFrom(null), 'project');
});

test('the left panel reopens on Model only when the person last chose it', () => {
  assert.equal(leftTabFrom('model'), 'model');
  assert.equal(leftTabFrom('project'), 'project');
  assert.equal(leftTabFrom('something else'), 'project');
});
