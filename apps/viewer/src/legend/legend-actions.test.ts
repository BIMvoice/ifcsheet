/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The legend actions the classic tab and the Wall share: create, change, place, remove. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { removeProjectItem, resetProject, useProjectStore } from '@/project/project-store';
import type { LegendLabels } from './legend-layout.js';
import { addLegend, keepLegendOnSheets, moveLegendCategory, placeLegend, projectLegends, toggleLegendCategory, updateLegend } from './legend-actions.js';

const LABELS: LegendLabels = {
  heading: { materials: 'Materials', layers: 'Layers', hatches: 'Hatches', symbols: 'Symbols', annotations: 'Annotations' },
  tool: (tool) => tool,
  continued: (heading) => `${heading} (continued)`,
  membrane: 'membrane',
  sampleText: 'Abc',
};
const sheet = { id: 's1', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2' as const, orientation: 'landscape' as const, viewports: [] };

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ sheets: [{ ...sheet }, { ...sheet, id: 's2', number: 'A-102' }] });
});

describe('legend actions', () => {
  it('makes a legend with the categories and scope it is given, and every category by default', () => {
    const a = addLegend('Key', { categories: ['hatches'], scope: 'sheet', scopeId: 's1' });
    const b = addLegend('All');
    const [first, second] = projectLegends();
    assert.deepEqual([first?.id, first?.categories, first?.scope, first?.scopeId, first?.title], [a, ['hatches'], 'sheet', 's1', 'Key']);
    assert.deepEqual([second?.id, second?.categories.length, second?.scope], [b, 5, 'project']);
  });

  it('does not share its categories with the default', () => {
    addLegend('One');
    toggleLegendCategory(projectLegends()[0]!.id, 'layers');
    addLegend('Two');
    assert.equal(projectLegends()[1]?.categories.includes('layers'), true);
  });

  it('switches a category on at the end and off, and moves one in the order', () => {
    const id = addLegend('Key', { categories: ['materials', 'hatches'] });
    toggleLegendCategory(id, 'symbols');
    assert.deepEqual(projectLegends()[0]?.categories, ['materials', 'hatches', 'symbols']);
    moveLegendCategory(id, 2, -1);
    assert.deepEqual(projectLegends()[0]?.categories, ['materials', 'symbols', 'hatches']);
    moveLegendCategory(id, 0, -1);
    assert.deepEqual(projectLegends()[0]?.categories, ['materials', 'symbols', 'hatches'], 'the first cannot go up');
    toggleLegendCategory(id, 'materials');
    assert.deepEqual(projectLegends()[0]?.categories, ['symbols', 'hatches']);
  });

  it('places a legend centred where its whole box is on the sheet, and not on top of a drawing', () => {
    const id = addLegend('Key', { categories: ['hatches'] });
    useProjectStore.setState({ sheets: useProjectStore.getState().sheets.map((s) => (s.id === 's1' ? { ...s, viewports: [{ id: 'v', viewId: 'plan', x: 420, y: 250, scale: 100, width: 700, height: 350, center: null }] } : s)) });
    const viewportId = placeLegend('s1', id, LABELS);
    const vp = useProjectStore.getState().sheets[0]?.viewports?.find((v) => v.id === viewportId);
    assert.ok(vp);
    const box = { w: 700, h: 350, x: 420, y: 250 };
    const overlapsX = Math.abs(vp.x - box.x) < box.w / 2;
    const overlapsY = Math.abs(vp.y - box.y) < box.h / 2;
    assert.equal(overlapsX && overlapsY, false, `the legend centre ${vp.x}, ${vp.y} is inside the drawing`);
  });

  it('places nothing for a legend or a sheet that is gone', () => {
    assert.equal(placeLegend('s1', 'nope', LABELS), null);
    assert.equal(placeLegend('nope', addLegend('Key'), LABELS), null);
  });

  it('removes a legend from the project and from every sheet it is on, and leaves the other viewports', () => {
    const id = addLegend('Key');
    placeLegend('s1', id, LABELS);
    placeLegend('s2', id, LABELS);
    useProjectStore.setState({ sheets: useProjectStore.getState().sheets.map((s) => (s.id === 's1' ? { ...s, viewports: [...(s.viewports ?? []), { id: 'v', viewId: 'plan', x: 1, y: 1, scale: 100, width: 0, height: 0, center: null }] } : s)) });
    removeProjectItem(id);
    assert.equal(projectLegends().length, 0);
    assert.deepEqual(useProjectStore.getState().sheets.map((s) => (s.viewports ?? []).map((v) => v.viewId)), [['plan'], []]);
  });

  it('changes a legend\'s title and columns', () => {
    const id = addLegend('Key');
    updateLegend(id, { title: 'Materials', columns: 3 });
    assert.deepEqual([projectLegends()[0]?.title, projectLegends()[0]?.columns], ['Materials', 3]);
  });
});

describe('keepLegendOnSheets', () => {
  it('pulls a legend that grew back inside the drawing area, and leaves one that fits where it is', () => {
    const id = addLegend('Key', { categories: ['hatches'] });
    const vp = (x: number) => ({ id: `vp${x}`, viewId: id, x, y: 100, scale: 100, width: 0, height: 0, center: null });
    useProjectStore.setState({ sheets: [{ ...sheet, viewports: [vp(590)] }, { ...sheet, id: 's2', number: 'A-102', viewports: [vp(300)] }] });
    keepLegendOnSheets(id, LABELS);
    const [off, fits] = useProjectStore.getState().sheets.map((s) => s.viewports?.[0]?.x ?? 0);
    assert.ok(off < 590 && off > 400, `moved in to ${off}`);
    assert.equal(fits, 300);
  });
});
