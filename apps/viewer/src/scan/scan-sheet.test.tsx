/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #181: a plan sliced from a scan prints like any drawing. On a sheet at
 * 1:100 a 10 m room is 100 mm of paper, and the DXF made from the sheet
 * carries its outline as lines on the CUT layer, at that size.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { SheetPaper } from '@/components/viewer/sheets/SheetPaper';
import { sheetDxf } from '@/components/viewer/sheets/sheet-dxf';
import { addProjectSheet, resetProject, useProjectStore } from '@/project/project-store';
import type { PlanProjectView, SheetViewport } from '@/project/types';
import { ROOM, roomPoints } from '@/test/scan-fixture';
import { scanDrawing } from './scan-drawing';

const PLAN: PlanProjectView = { id: 'p', kind: 'plan', name: 'Level 0', createdAt: 0, cutHeight: 1.2, scale: 100, level: { name: 'Level 0', elevation: 0, storeyGlobalIds: ['scan-level:l0'] } };

/** LINE entities of a DXF on `layer`, as their two ends (groups 10/20 and 11/21). */
function linesOn(dxf: string, layer: string): { x0: number; y0: number; x1: number; y1: number }[] {
  const rows = dxf.split(/\r?\n/).map((r) => r.trim());
  const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let i = 0; i + 1 < rows.length; i += 2) {
    if (rows[i] !== '0' || rows[i + 1] !== 'LINE') continue;
    const e: Record<string, string> = {};
    for (let j = i + 2; j + 1 < rows.length && rows[j] !== '0'; j += 2) e[rows[j]] = rows[j + 1];
    if (e['8'] === layer) out.push({ x0: Number(e['10']), y0: Number(e['20']), x1: Number(e['11']), y1: Number(e['21']) });
  }
  return out;
}

beforeEach(() => resetProject());
afterEach(() => cleanup());

describe('a scan plan on a sheet (#181)', () => {
  it('exports its outline to DXF as CUT lines at the sheet scale', async () => {
    const xyz = roomPoints([ROOM]);
    const drawing = await scanDrawing({ xyz, count: xyz.length / 3, bounds: null }, PLAN, []);
    assert.ok(drawing && drawing.lines.length > 0);
    const id = addProjectSheet('Plans');
    const viewport: SheetViewport = { id: 'vp', viewId: PLAN.id, x: 300, y: 250, scale: 100, width: 0, height: 0, center: null };
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => (x.id === id ? { ...x, paper: 'A1', orientation: 'landscape', viewports: [viewport] } : x)) }));
    const sheet = useProjectStore.getState().sheets[0];
    const container = render(<SheetPaper sheet={sheet} projectName="Survey" content={() => ({ view: PLAN, drawing, drafts: [] })} layers={[]} extraPatterns={[]} selectedViewportId={null} pxPerMm={1} />);
    const svg = container.querySelector('svg') as unknown as SVGSVGElement;
    // happy-dom has no layout: the identity mapping an SVG in millimetres has, and the strokes the attributes carry.
    for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) Object.defineProperty(el, 'getScreenCTM', { value: () => new DOMMatrix() });
    const realStyle = globalThis.getComputedStyle;
    globalThis.getComputedStyle = ((el: Element) => ({ stroke: el.getAttribute('stroke') ?? 'none', fill: el.getAttribute('fill') ?? '#000', fontSize: el.getAttribute('font-size') ?? '2.5', textAnchor: el.getAttribute('text-anchor') ?? 'start' })) as never;
    let dxf: string;
    try { dxf = new TextDecoder().decode(sheetDxf(svg, sheet)); } finally { globalThis.getComputedStyle = realStyle; }
    const cut = linesOn(dxf, 'CUT');
    assert.equal(cut.length, drawing.lines.length, 'every line of the outline is in the DXF');
    const xs = cut.flatMap((l) => [l.x0, l.x1]), ys = cut.flatMap((l) => [l.y0, l.y1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    // 10 x 6 m at 1:100: 100 x 60 mm, give or take a traced cell (0.5 mm of paper) each side.
    assert.ok(Math.abs(w - 100) <= 1.5, `width ${w} mm`);
    assert.ok(Math.abs(h - 60) <= 1.5, `height ${h} mm`);
  });
});
