/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #185: a model with no IFC project (glTF, LandXML, point cloud) still prints
 * a project name (its file's) and the date; the fields nothing fills are
 * listed so the person types them; typed values survive a save and reopen;
 * an IFC model (FZK-Haus) prints exactly what it printed before.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStep, seedModel } from '@/test/properties-panel-harness.js';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store';
import { parseProjectFile, serializeProject } from './project-file';
import { modelTitleBlock } from './drawing-set-actions';
import { seedProjectTitleBlock, setProjectTitleBlockField } from './sheets';
import { TITLE_BLOCK_FIELDS } from './title-block';
import { effectiveTitleBlock, lacksProjectData, modelFacts, resolvedTitleBlock } from './title-block-model';
import { DEFAULT_SOURCES, fieldsWithoutSource, projectNameFromFile, type TitleSource } from './title-block-sources';

const nonIfc = (name: string): FederatedModel => ({ id: name, name, ifcDataStore: null, visible: true } as unknown as FederatedModel);
const open = (...names: string[]): void => useViewerStore.setState({ models: new Map(names.map((n) => [n, nonIfc(n)])) });

beforeEach(() => { resetProject(); useViewerStore.setState({ models: new Map() }); });
afterEach(() => { useViewerStore.setState({ models: new Map() }); });

describe('projectNameFromFile', () => {
  it('drops the extension and tidies separators', () => {
    assert.equal(projectNameFromFile('Hello_Wall-v2.glb'), 'Hello Wall v2');
    assert.equal(projectNameFromFile('  site  plan.LandXML '), 'site plan');
    assert.equal(projectNameFromFile('Plan 1.2'), 'Plan 1 2'.replace('1 2', '1.2'));
  });
});

describe('a model with no IFC project', () => {
  for (const file of ['hello-wall.glb', 'terrain.xml', 'scan.laz']) {
    it(`${file} gets the file name as its project name, and the date`, () => {
      open(file);
      seedProjectTitleBlock(modelTitleBlock(new Date('2026-10-21T10:00:00Z')));
      const block = effectiveTitleBlock();
      assert.equal(block.project, projectNameFromFile(file));
      assert.equal(block.date, '2026-10-21');
      assert.equal(resolvedTitleBlock(undefined, undefined).project.from, 'model');
      assert.equal(lacksProjectData(), true);
    });
  }

  it('lists the fields nothing fills', () => {
    open('hello-wall.glb');
    seedProjectTitleBlock(modelTitleBlock());
    const missing = fieldsWithoutSource(TITLE_BLOCK_FIELDS, resolvedTitleBlock(useProjectStore.getState().titleBlock, undefined));
    assert.deepEqual(missing, ['address', 'client', 'organisation', 'drawnBy', 'checkedBy']);
  });

  it('a typed project name beats the file name, and typed values round-trip through save and reopen', () => {
    open('hello-wall.glb');
    seedProjectTitleBlock(modelTitleBlock(new Date('2026-10-21T10:00:00Z')));
    setProjectTitleBlockField('project', 'Casa Lunga');
    setProjectTitleBlockField('address', 'Str. Mare 1');
    const reopened = parseProjectFile(serializeProject(projectDocument()));
    resetProject();
    loadProjectDocument(reopened);
    const block = effectiveTitleBlock();
    assert.equal(block.project, 'Casa Lunga');
    assert.equal(block.address, 'Str. Mare 1');
    assert.equal(block.date, '2026-10-21');
    assert.deepEqual(fieldsWithoutSource(TITLE_BLOCK_FIELDS, resolvedTitleBlock(useProjectStore.getState().titleBlock, undefined)), ['client', 'organisation', 'drawnBy', 'checkedBy']);
  });

  it('nothing is loaded: nothing is invented', () => {
    assert.equal(effectiveTitleBlock().project, undefined);
    assert.equal(lacksProjectData(), false);
  });
});

describe('an IFC model (FZK-Haus)', () => {
  it('prints what it printed before the file name existed', async () => {
    const store = await parseStep(readFileSync(resolve(process.cwd(), 'src/test/__fixtures__/AC20-FZK-Haus.ifc')));
    seedModel('fzk', 0, store, 1);
    useViewerStore.setState({ models: new Map([...useViewerStore.getState().models].map(([k, m]) => [k, { ...m, name: 'AC20-FZK-Haus.ifc' }])) });
    const before: Record<string, readonly TitleSource[]> = { ...DEFAULT_SOURCES, project: DEFAULT_SOURCES.project.filter((s) => s.kind !== 'file') };
    const now = resolvedTitleBlock(undefined, undefined);
    const old = resolvedTitleBlock(undefined, before as never);
    assert.deepEqual(now, old);
    assert.equal(lacksProjectData(), false);
    assert.equal(modelFacts().file?.() ?? '', '');
    assert.notEqual(now.project.source?.kind, 'file');
  });
});
