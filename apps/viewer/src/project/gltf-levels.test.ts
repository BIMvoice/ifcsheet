/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #183: a glTF/GLB model has no storeys, so the person defines the levels and
 * each gets a plan cut above its floor; the levels are saved with the project;
 * the model gets the 3D view an IFC model gets; an IFC model is left as it was.
 * The model here is two slabs and a roof, 6.4 m tall, built as the meshes a
 * GLB loads to (no IFC data store).
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { sectionConfigFor } from '@bimvoice/ifcsheet/headless';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { ensureDrawingSet } from './drawing-set-actions.js';
import { detectLevels } from './level-detect.js';
import { parseProjectFile, serializeProject } from './project-file.js';
import { isMeshOnlyModel, loadedModels } from './project-sync.js';
import { loadProjectDocument, projectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store.js';
import { addUserLevel, moveUserLevel, removeUserLevel, renameUserLevel, replaceUserLevels } from './user-levels.js';
import { levelFloorY, planCutHeight, resolvePlanLevel } from './view-defaults.js';
import type { PlanProjectView } from './types.js';

/** A flat square of `size` metres at height `y`, facing up. */
function slab(y: number, size: number, id: number): MeshData {
  const h = size / 2;
  return {
    expressId: id, color: [0.8, 0.8, 0.8, 1],
    positions: new Float32Array([-h, y, -h, h, y, -h, h, y, h, -h, y, h]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
  };
}
/** A wall: a vertical quad from `y0` to `y1`. */
function wall(y0: number, y1: number, id: number): MeshData {
  return {
    expressId: id, color: [0.6, 0.6, 0.6, 1],
    positions: new Float32Array([-5, y0, 5, 5, y0, 5, 5, y1, 5, -5, y1, 5]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  };
}
/** Ground slab at 0, a floor at 3.2, a roof at 6.4, walls between. */
const BUILDING: MeshData[] = [slab(0, 10, 1), slab(3.2, 10, 2), slab(6.4, 10, 3), wall(0, 6.4, 4)];
const BOUNDS = { min: { x: -5, y: 0, z: -5 }, max: { x: 5, y: 6.4, z: 5 } };

const glb = (meshes: MeshData[]): FederatedModel => ({ id: 'g', name: 'two-storey.glb', ifcDataStore: null, geometryResult: { meshes }, visible: true } as unknown as FederatedModel);
const open = (meshes: MeshData[] = BUILDING): void => {
  useViewerStore.setState({ models: new Map([['g', glb(meshes)]]) });
  const { refs, storeys } = loadedModels();
  syncProjectWithModels(refs, storeys);
};
const state = () => useProjectStore.getState();
const plans = (): PlanProjectView[] => state().views.filter((v): v is PlanProjectView => v.kind === 'plan');
/** Where a plan is cut, in the drawing frame: what the drawing generator is handed. */
const cutAt = (plan: PlanProjectView): number | undefined => sectionConfigFor(plan, state().levels, BOUNDS)?.plane.position;

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map() }); });
afterEach(() => { useViewerStore.setState({ models: new Map() }); });

describe('a glTF model with two levels of the person\'s own', () => {
  it('gets two plans, each cut above its own floor', () => {
    open();
    addUserLevel('Ground', 0);
    addUserLevel('First', 3.2);
    ensureDrawingSet(BUILDING, BOUNDS);
    const made = plans();
    assert.deepEqual(made.map((p) => [p.name, p.level.elevation]).sort(), [['First', 3.2], ['Ground', 0]]);
    assert.deepEqual(made.map(cutAt).sort(), [1.2, 4.4]);
    // Each is on a sheet, not left loose.
    const hung = new Set(state().sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.viewId)));
    for (const p of made) assert.ok(hung.has(p.id), p.name);
  });

  it('holds the cut of a level close under the next to half the way up, never past it', () => {
    open();
    addUserLevel('Ground', 0);
    addUserLevel('Mezzanine', 0.8);
    ensureDrawingSet(BUILDING, BOUNDS);
    const byName = (n: string) => plans().find((p) => p.name === n);
    assert.equal(byName('Ground')?.cutHeight, 0.4);
    assert.equal(byName('Mezzanine')?.cutHeight, 1.2);
    assert.deepEqual([cutAt(byName('Ground')!), cutAt(byName('Mezzanine')!)], [0.4, 2]);
  });

  it('turns the plan the set made at mid-height into the plan of the level at its floor', () => {
    open();
    ensureDrawingSet(BUILDING, BOUNDS);
    assert.deepEqual(plans().map((p) => [p.name, p.cutHeight]), [['Plan', 3.2]]);
    addUserLevel('Ground', 0);
    ensureDrawingSet(BUILDING, BOUNDS);
    assert.deepEqual(plans().map((p) => [p.name, p.cutHeight, p.level.name]), [['Ground', 1.2, 'Ground']]);
  });

  it('renames, moves and deletes a level; its plan follows the first two and stays for the third', () => {
    open();
    const id = addUserLevel('Level 1', 0)!;
    assert.equal(renameUserLevel(id, 'Ground floor'), true);
    assert.equal(renameUserLevel(id, 'Ground floor'), false);
    assert.deepEqual(plans().map((p) => p.name), ['Ground floor']);
    assert.equal(moveUserLevel(id, 0.5), true);
    assert.equal(plans()[0].level.elevation, 0.5);
    assert.equal(plans().length, 1);
    assert.equal(resolvePlanLevel(plans()[0], state().levels)?.name, 'Ground floor');
    removeUserLevel(id);
    assert.deepEqual(state().userLevels, []);
    assert.deepEqual(state().levels, []);
    assert.equal(plans().length, 1);
  });

  it('is shown the 3D view an IFC model gets', () => {
    open();
    assert.equal(state().views.filter((v) => v.kind === '3d').length, 1);
    assert.equal(state().models.length, 1);
  });
});

describe('the levels are the project\'s', () => {
  it('survive save and reopen, and the plans they made still resolve', () => {
    open();
    addUserLevel('Ground', 0);
    addUserLevel('First', 3.2);
    ensureDrawingSet(BUILDING, BOUNDS);
    const saved = serializeProject(projectDocument());
    const before = state().userLevels;
    resetProject();
    assert.deepEqual(state().userLevels, []);
    assert.deepEqual(state().levels, []);
    loadProjectDocument(parseProjectFile(saved));
    assert.deepEqual(state().userLevels, before);
    assert.deepEqual(state().levels.map((l) => [l.name, l.elevation]), [['First', 3.2], ['Ground', 0]]);
    for (const p of plans()) assert.ok(resolvePlanLevel(p, state().levels), p.name);
    assert.deepEqual(plans().map(cutAt).sort(), [1.2, 4.4]);
  });

  it('leave a file that has none reading as it did', () => {
    open();
    const doc = parseProjectFile(serializeProject(projectDocument()));
    assert.equal(doc.userLevels, undefined);
    assert.deepEqual(state().userLevels, []);
  });

  it('drop an entry that is not a name and a height, and keep the rest', () => {
    const raw = JSON.parse(serializeProject(projectDocument())) as Record<string, unknown>;
    raw.userLevels = [{ id: 'a', name: 'Ground', elevation: 0 }, { id: 'b', name: '', elevation: 1 }, { id: 'c', name: 'Bad', elevation: 'high' }, 7];
    assert.deepEqual(parseProjectFile(JSON.stringify(raw)).userLevels, [{ id: 'a', name: 'Ground', elevation: 0 }]);
  });
});

describe('a model that is only meshes', () => {
  it('is a model of the project, which a LandXML or a point cloud is not', () => {
    assert.equal(isMeshOnlyModel(glb(BUILDING)), true);
    assert.equal(isMeshOnlyModel({ ...glb(BUILDING), landXmlDocument: {} } as unknown as FederatedModel), false);
    assert.equal(isMeshOnlyModel(glb([])), false);
    useViewerStore.setState({ models: new Map([['p', glb([])]]) });
    assert.deepEqual(loadedModels().refs, []);
  });
});

describe('an IFC model (storeys)', () => {
  it('is cut at 1.2 m above each storey, however close, as before', () => {
    const storeys = [{ name: 'A', elevation: 0, globalId: 'g-a' }, { name: 'B', elevation: 1, globalId: 'g-b' }];
    syncProjectWithModels([{ key: 'm', name: 'm' }], storeys);
    assert.deepEqual(plans().map((p) => p.cutHeight), [1.2, 1.2]);
    for (const l of state().levels) assert.equal(planCutHeight(l, state().levels), 1.2);
    assert.equal(levelFloorY(state().levels[0]) + 1.2, 2.2);
  });
});

describe('finding the levels in a model', () => {
  it('reads two floors and the ground, and leaves the roof out', () => {
    assert.deepEqual(detectLevels(BUILDING), [{ elevation: 0 }, { elevation: 3.2 }]);
  });

  it('gives a box its lowest point, not its lid', () => {
    assert.deepEqual(detectLevels([slab(0.5, 1, 1), slab(-0.5, 1, 2)]), [{ elevation: -0.5 }]);
  });

  it('is empty for no geometry, and ignores a small ledge', () => {
    assert.deepEqual(detectLevels([]), []);
    assert.deepEqual(detectLevels([...BUILDING, slab(1.5, 1, 9)]).map((l) => l.elevation), [0, 3.2]);
  });

  it('takes what it finds as the project\'s levels, named from the lowest', () => {
    open();
    replaceUserLevels(detectLevels(BUILDING));
    assert.deepEqual(state().userLevels?.map((l) => [l.name, l.elevation]), [['Level 1', 0], ['Level 2', 3.2]]);
    assert.equal(state().levels.length, 2);
  });
});
