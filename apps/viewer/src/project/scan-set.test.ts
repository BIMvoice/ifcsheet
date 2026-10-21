/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #181: a scan's levels are the user's. Setting them moves each level's plan
 * (its cut follows the floor), makes a plan for a new level and removes the
 * plan of a level taken away; and what was set comes back after the project
 * is saved and opened again.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store';
import { parseProjectFile, serializeProject } from './project-file';
import { ensureScanPlans, scanPlanOf, scanSectionProposals, setScanLevels } from './scan-set';
import { scanSliceForView } from '@/scan/scan-drawing';

const GROUND = { id: 'l0', name: 'Level 0', elevation: 0 };

beforeEach(() => resetProject());

describe('the levels of a scan (#181)', () => {
  it('move, rename, add and remove their plans', () => {
    useProjectStore.setState({ scanLevels: [GROUND] });
    ensureScanPlans([GROUND]);
    const plan = scanPlanOf('l0')!;
    const added = setScanLevels([{ ...GROUND, name: 'Parter', elevation: -0.35 }, { id: 'l1', name: 'Etaj 1', elevation: 2.95 }]);
    const moved = scanPlanOf('l0')!;
    assert.equal(moved.id, plan.id, 'the same plan, moved');
    assert.equal(moved.name, 'Parter', 'renamed with its level, as it still had the level name');
    assert.equal(scanSliceForView(moved, [])!.plane.position, -0.35 + 1.2, 'cut 1.2 m above the new floor');
    assert.deepEqual(added, [scanPlanOf('l1')!.id]);
    setScanLevels([{ ...GROUND, name: 'Parter', elevation: -0.35 }]);
    assert.equal(scanPlanOf('l1'), undefined, 'the plan of a level taken away goes with it');
  });

  it('keep a plan name typed by hand', () => {
    useProjectStore.setState({ scanLevels: [GROUND] });
    ensureScanPlans([GROUND]);
    const plan = scanPlanOf('l0')!;
    useProjectStore.setState((s) => ({ views: s.views.map((v) => (v.id === plan.id ? { ...v, name: 'Survey plan' } : v)) }));
    setScanLevels([{ ...GROUND, name: 'Parter' }]);
    assert.equal(scanPlanOf('l0')!.name, 'Survey plan');
  });

  it('come back after save and reopen, with their plans', () => {
    useProjectStore.setState({ scanLevels: [GROUND] });
    ensureScanPlans([GROUND]);
    setScanLevels([{ ...GROUND, name: 'Parter', elevation: -0.35 }, { id: 'l1', name: 'Etaj 1', elevation: 2.95 }]);
    const saved = serializeProject(projectDocument());
    resetProject();
    assert.equal(useProjectStore.getState().scanLevels, undefined);
    loadProjectDocument(parseProjectFile(saved));
    assert.deepEqual(useProjectStore.getState().scanLevels, [{ id: 'l0', name: 'Parter', elevation: -0.35 }, { id: 'l1', name: 'Etaj 1', elevation: 2.95 }]);
    assert.equal(scanSliceForView(scanPlanOf('l1')!, [])!.plane.position, 2.95 + 1.2);
  });

  it('refuse a level read from a file without a finite height', () => {
    const doc = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    doc.scanLevels = [{ id: 'a', name: 'Ok', elevation: 1 }, { id: 'b', name: 'Bad', elevation: 'high' }, { id: 'c', name: 'Inf', elevation: null }];
    assert.deepEqual(parseProjectFile(JSON.stringify(doc)).scanLevels, [{ id: 'a', name: 'Ok', elevation: 1 }]);
  });
});

describe('the sections a scan starts with', () => {
  it('run along its longer side first, then across, through the middle and past its edges', () => {
    const [first, second] = scanSectionProposals({ min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 3, z: 6 } });
    assert.deepEqual([first.a, first.b], [{ x: -1, z: 3 }, { x: 11, z: 3 }]);
    assert.deepEqual([second.a.x, second.b.x], [5, 5]);
    const [deep] = scanSectionProposals({ min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 12 } });
    assert.equal(deep.a.x, deep.b.x, 'a deep scan is cut along its depth first');
  });

  it('cross where the scan mostly is, not at the middle of its box', () => {
    const [along, across] = scanSectionProposals({ min: { x: 0, y: 0, z: 0 }, max: { x: 40, y: 3, z: 20 } }, { x: 30, z: 4 });
    assert.deepEqual([along.a.z, along.b.z], [4, 4]);
    assert.deepEqual([across.a.x, across.b.x], [30, 30]);
  });
});
