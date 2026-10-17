/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act, useState } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { blur, cleanup, click, press, render, type } from '@/test/render.js';
import { loadProjectDocument, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import type { ProjectLevel } from '@/project/types';
import { addLegend, placeLegend } from '@/legend/legend-actions';
import type { LegendLabels } from '@/legend/legend-layout';
import { cancelCommand, runningCommand, startDraftCommand, useDraftingSession } from '@/drafting/session';
import { sheetPrintHtml } from '../sheets/sheet-export.js';
import { useSheetContent } from '../sheets/useSheetContent.js';
import { SheetCanvas } from './SheetCanvas.js';
import { ProjectDrawer } from './ProjectDrawer.js';
import { ViewportCard } from './ViewportCard.js';
import { stepInto, useWallNav } from './wall-nav.js';

/**
 * Legends on the Wall, through the Wall's own components: the drawer's
 * Legends group and form, the viewport card's place list and legend controls,
 * and the sheet as it prints. Nothing here goes through the classic panels.
 */

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const LEVELS: ProjectLevel[] = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];

/** The drawer, and the open sheet with its canvas and viewport card, as SteppedSheet wires them. */
function WallHarness() {
  const stepped = useWallNav((s) => s.stepped);
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.id === stepped));
  const [chosen, setChosen] = useState<string | null>(null);
  return (
    <>
      <ProjectDrawer extent={HOUSE} onClose={() => {}} />
      {sheet ? <OpenSheet sheet={sheet} chosen={chosen} onChoose={setChosen} /> : null}
    </>
  );
}

function OpenSheet({ sheet, chosen, onChoose }: { sheet: NonNullable<ReturnType<typeof useProjectStore.getState>['sheets'][number]>; chosen: string | null; onChoose: (id: string | null) => void }) {
  const content = useSheetContent(sheet);
  const slot = (sheet.viewports ?? []).find((v) => v.id === chosen) ?? null;
  return (
    <>
      <SheetCanvas sheet={sheet} sheetContent={content} chosenId={chosen} onChoose={onChoose} onOpen={() => {}} onNudge={() => {}} fitKey={0} />
      <ViewportCard sheet={sheet} slot={slot} onOpen={() => {}} onChoose={onChoose} />
    </>
  );
}

const LABELS: LegendLabels = {
  heading: { materials: 'Materials', layers: 'Layers', hatches: 'Hatches', symbols: 'Symbols', annotations: 'Annotations' },
  tool: (tool) => tool,
  continued: (heading) => `${heading} (continued)`,
  membrane: 'membrane',
  sampleText: 'Abc',
};
const state = () => useProjectStore.getState();
const sheetNo = (n: string) => {
  const s = state().sheets.find((x) => x.number === n);
  assert.ok(s, `sheet ${n}`);
  return s;
};
const button = (ui: HTMLElement, text: string | RegExp) => {
  const b = [...ui.querySelectorAll('button')].find((x) => (typeof text === 'string' ? x.textContent === text : text.test(x.textContent ?? '')));
  assert.ok(b, `a button ${String(text)}`);
  return b;
};
const pressed = (b: HTMLElement) => b.getAttribute('aria-pressed');
const choose = (select: HTMLSelectElement, value: string) => act(() => {
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
});
const printed = (ui: HTMLElement, number: string) => {
  const svg = ui.querySelector('[data-sheet-canvas] svg');
  assert.ok(svg instanceof window.SVGSVGElement);
  return sheetPrintHtml(svg, sheetNo(number));
};

beforeEach(() => {
  resetProject();
  useWallNav.setState({ stepped: null, focus: null, visit: 0, drawer: true });
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, HOUSE);
});
afterEach(() => cleanup());

describe('Legends on the Wall: the drawer', () => {
  it('lists the Legends group after Schedules, with a +', () => {
    const ui = render(<WallHarness />);
    const titles = [...ui.querySelectorAll('h3')].map((h) => h.textContent);
    assert.ok(titles.indexOf('Legends') > titles.indexOf('Schedules'));
    button(ui, '+ Legend');
  });

  it('makes a legend with the starting set: materials and hatches, the whole project', () => {
    const ui = render(<WallHarness />);
    click(button(ui, '+ Legend'));
    assert.deepEqual([pressed(button(ui, 'Materials (cut hatches)')), pressed(button(ui, 'Hatches')), pressed(button(ui, 'Symbols'))], ['true', 'true', 'false']);
    click(button(ui, 'Make legend'));
    const [legend] = state().legends ?? [];
    assert.deepEqual([legend?.categories, legend?.scope, legend?.scopeId], [['materials', 'hatches'], 'project', undefined]);
    assert.equal(state().sheets.some((s) => s.viewports?.some((v) => v.viewId === legend?.id)), false, 'no sheet open: nothing placed');
  });

  for (const [toggle, category] of [['Materials (cut hatches)', 'materials'], ['Lines and layers', 'layers'], ['Hatches', 'hatches'], ['Symbols', 'symbols'], ['Annotation types', 'annotations']] as const) {
    it(`makes a legend listing only ${category}`, () => {
      const ui = render(<WallHarness />);
      click(button(ui, '+ Legend'));
      for (const off of ['Materials (cut hatches)', 'Hatches']) click(button(ui, off));
      click(button(ui, toggle));
      click(button(ui, 'Make legend'));
      assert.deepEqual(state().legends?.[0]?.categories, [category]);
    });
  }

  it('will not make a legend that lists nothing', () => {
    const ui = render(<WallHarness />);
    click(button(ui, '+ Legend'));
    click(button(ui, 'Materials (cut hatches)'));
    click(button(ui, 'Hatches'));
    assert.equal(button(ui, 'Make legend').disabled, true);
    assert.equal(state().legends?.length ?? 0, 0);
  });

  it('puts a legend made while A-101 is open on A-101, and the sheet prints it', () => {
    const a101 = sheetNo('A-101');
    const hatchView = state().views.find((v) => v.kind === 'plan');
    assert.ok(hatchView);
    useProjectStore.setState({ drafts: [{ id: 'h1', viewId: hatchView.id, layerId: '0', params: {}, shape: { type: 'hatch', loops: [], pattern: 'brick', scale: 1, angle: 0 } }] });
    act(() => stepInto(a101.id));
    const ui = render(<WallHarness />);
    click(button(ui, '+ Legend'));
    type(ui.querySelector<HTMLInputElement>('input[type="text"], form input:not([type])')!, 'Materials key');
    click(button(ui, /^Make legend and place it on A-101/));
    const legend = state().legends?.[0];
    assert.ok(legend);
    const placed = sheetNo('A-101').viewports?.filter((v) => v.viewId === legend.id) ?? [];
    assert.equal(placed.length, 1);
    const html = printed(ui, 'A-101');
    assert.match(html, /Materials key|Legend/);
    assert.match(html, /BRICK/, 'the hatch the project uses is listed in what prints');
    assert.match(html, /LEGEND/, 'tagged for the DXF layer');
  });

  it('covers the open sheet when asked: the scope is that sheet', () => {
    const a101 = sheetNo('A-101');
    act(() => stepInto(a101.id));
    const ui = render(<WallHarness />);
    click(button(ui, '+ Legend'));
    click(button(ui, 'This sheet, A-101'));
    click(button(ui, /^Make legend/));
    const legend = state().legends?.[0];
    assert.deepEqual([legend?.scope, legend?.scopeId], ['sheet', a101.id]);
  });

  it('works while a drawing tool is running, and feeds it nothing', () => {
    const a101 = sheetNo('A-101');
    act(() => stepInto(a101.id));
    // The open sheet's canvas attaches the drafting session to the sheet; LINE then runs on it.
    const ui = render(<WallHarness />);
    assert.equal(startDraftCommand('line'), true);
    const running = runningCommand();
    assert.ok(running);
    const history = useDraftingSession.getState().history;
    click(button(ui, '+ Legend'));
    click(button(ui, /^Make legend/));
    assert.equal(state().legends?.length, 1);
    assert.equal(sheetNo('A-101').viewports?.some((v) => v.viewId === state().legends?.[0]?.id), true);
    assert.equal(runningCommand(), running, 'the running tool is the same one');
    assert.equal(useDraftingSession.getState().commandId, 'line');
    assert.equal(useDraftingSession.getState().history, history, 'nothing was typed into it');
    cancelCommand();
  });

  it('keeps Enter and Space for its buttons (the drafting keys leave them alone)', () => {
    const ui = render(<WallHarness />);
    click(button(ui, '+ Legend'));
    assert.ok(button(ui, 'Hatches').closest('[data-owns-keys]'));
    assert.ok(ui.querySelector('form')?.closest('[data-owns-keys]'));
  });

  it('goes to the sheet a legend is on, renames on double-click, and deletes with the cross', () => {
    const id = addLegend('Key');
    const a101 = sheetNo('A-101');
    placeLegend(a101.id, id, LABELS);
    const ui = render(<WallHarness />);
    click(button(ui, 'Key'));
    assert.equal(useWallNav.getState().stepped, a101.id);

    act(() => { button(ui, 'Key').dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); });
    const field = ui.querySelector<HTMLInputElement>('input[aria-label="Name"]');
    assert.ok(field);
    type(field, 'Hatch key');
    press(field, 'Enter');
    blur(field);
    assert.equal(state().legends?.[0]?.name, 'Hatch key');

    click(ui.querySelector<HTMLButtonElement>('button[aria-label="Remove Hatch key"]')!);
    assert.equal(state().legends?.length, 0);
    assert.equal(sheetNo('A-101').viewports?.some((v) => v.viewId === id), false, 'a deleted legend leaves the sheets');
  });

  it('hangs a legend that is on no sheet on a sheet of its own', () => {
    addLegend('Key');
    const ui = render(<WallHarness />);
    click(button(ui, 'Key'));
    const id = state().legends?.[0]?.id;
    const sheet = state().sheets.find((s) => s.viewports?.some((v) => v.viewId === id));
    assert.ok(sheet);
    assert.match(sheet.number, /^A-6/);
    assert.equal(useWallNav.getState().stepped, sheet.id);
  });
});

describe('Legends on the Wall: the viewport card', () => {
  const setup = () => {
    const id = addLegend('Key', { categories: ['materials', 'hatches'] });
    act(() => stepInto(sheetNo('A-101').id));
    return { id, ui: render(<WallHarness />) };
  };

  it('offers a legend in the place list and places it on the sheet', () => {
    const { id, ui } = setup();
    const list = [...ui.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === id));
    assert.ok(list, 'the legend is in the list next to views and schedules');
    choose(list, id);
    assert.equal(sheetNo('A-101').viewports?.filter((v) => v.viewId === id).length, 1);
    assert.ok(ui.querySelector('input[value="Key"]'), 'the placed legend is chosen: its card shows');
  });

  it('puts a placed legend where it covers no drawing', () => {
    const { id } = setup();
    const a101 = sheetNo('A-101');
    placeLegend(a101.id, id, LABELS);
    const vp = sheetNo('A-101').viewports?.find((v) => v.viewId === id);
    assert.ok(vp);
    // The drawing area of an A2 sheet is 594 wide; the legend sits in its lower right half.
    assert.ok(vp.x > 297 && vp.y > 210, `at ${vp.x}, ${vp.y}`);
  });

  it('edits the title, columns and categories of a placed legend, on every sheet it is on', () => {
    const { id, ui } = setup();
    const other = sheetNo('A-201');
    placeLegend(other.id, id, LABELS);
    const list = [...ui.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === id));
    assert.ok(list);
    choose(list, id);

    const title = ui.querySelector<HTMLInputElement>('input[value="Key"]');
    assert.ok(title);
    // the card has the legend's title and the rename field; the title field is the first labelled so
    const titleField = [...ui.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Legend title'))?.querySelector('input');
    assert.ok(titleField);
    type(titleField, 'Materials');
    blur(titleField);
    choose([...ui.querySelectorAll('select')].find((s) => s.closest('label')?.textContent?.startsWith('Columns'))!, '3');
    click(button(ui, 'Symbols'));
    click(button(ui, 'Hatches'));

    const legend = state().legends?.find((l) => l.id === id);
    assert.deepEqual([legend?.title, legend?.columns, legend?.categories], ['Materials', 3, ['materials', 'symbols']]);
    // One legend, placed twice: both sheets show the one that was edited.
    const count = state().sheets.filter((s) => s.viewports?.some((v) => v.viewId === id)).length;
    assert.equal(count, 2);
  });

  it('shows no scale for a legend (it prints at paper size)', () => {
    const { id, ui } = setup();
    const list = [...ui.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === id));
    choose(list!, id);
    assert.equal([...ui.querySelectorAll('label')].some((l) => l.textContent?.startsWith('Scale')), false);
  });
});

describe('Legends on the Wall: saved with the project', () => {
  it('a legend and its place on a sheet come back when the project is reopened', () => {
    const id = addLegend('Key', { categories: ['hatches'], scope: 'sheet', scopeId: sheetNo('A-101').id });
    placeLegend(sheetNo('A-101').id, id, LABELS);
    const doc = JSON.parse(JSON.stringify(projectDocument()));
    resetProject();
    loadProjectDocument(doc, { dirty: false });
    assert.deepEqual(state().legends?.[0]?.categories, ['hatches']);
    assert.equal(state().sheets.find((s) => s.number === 'A-101')?.viewports?.some((v) => v.viewId === id), true);
  });
});
