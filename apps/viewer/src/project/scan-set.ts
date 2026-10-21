/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawings a scan gives (#181): a plan for each of its levels, cut a
 * standard height above the floor, and two sections across it, along and
 * across its longer side, marked on the lowest plan like any section. A scan
 * has no storeys, so its levels are the user's (`ProjectDocument.scanLevels`),
 * and each plan names the level it belongs to by a tag in its level's
 * `storeyGlobalIds` (`scan-level:<id>`), so changing a level moves its plan.
 */

import { createProposedSection } from '@/drafting/section-create';
import { resolve } from '@/i18n/registry';
import type { AxisBounds } from '@/lib/section/section-distance';
import type { ScanLevel } from '@/scan/scan-levels';
import { addProjectView, removeProjectItem, updateProjectView, useProjectStore } from './project-store';
import { CUT_OVERHANG_M, type SectionProposal } from './section-proposals';
import { DEFAULT_PLAN_CUT_HEIGHT_M } from './view-defaults';
import type { PlanProjectView, ProjectView } from './types';

const TAG = 'scan-level:';
export const scanLevelTag = (id: string): string => `${TAG}${id}`;

/** The plan drawn for the scan level `id`, if there is one. */
export function scanPlanOf(id: string, views: readonly ProjectView[] = useProjectStore.getState().views): PlanProjectView | undefined {
  return views.find((v): v is PlanProjectView => v.kind === 'plan' && v.level.storeyGlobalIds.includes(scanLevelTag(id)));
}

/** Whether a plan belongs to a scan level. */
export const isScanPlan = (view: ProjectView): boolean => view.kind === 'plan' && view.level.storeyGlobalIds.some((g) => g.startsWith(TAG));

const levelOf = (l: ScanLevel) => ({ name: l.name, elevation: l.elevation, storeyGlobalIds: [scanLevelTag(l.id)] });

/** A plan for every scan level that has none; returns the ids of the plans added. */
export function ensureScanPlans(levels: readonly ScanLevel[]): { added: string[]; existing: number } {
  const added: string[] = [];
  let existing = 0;
  for (const level of [...levels].sort((a, b) => a.elevation - b.elevation)) {
    if (scanPlanOf(level.id)) { existing++; continue; }
    added.push(addProjectView({ kind: 'plan', name: level.name, cutHeight: DEFAULT_PLAN_CUT_HEIGHT_M, level: levelOf(level) }));
  }
  return { added, existing };
}

/**
 * The two sections a scan starts with: along its longer side and across it, one metre past its edges, crossing at
 * `centre` (where most of its points are, `scanCentre`; absent: the middle of its box).
 */
export function scanSectionProposals(bounds: AxisBounds, centre?: { x: number; z: number } | null): SectionProposal[] {
  const { min, max } = bounds;
  const cx = centre?.x ?? (min.x + max.x) / 2, cz = centre?.z ?? (min.z + max.z) / 2, o = CUT_OVERHANG_M;
  const alongX: SectionProposal = { key: 'scan-x', through: 'scan-x', label: resolve('names.scan.sectionAlongX'), a: { x: min.x - o, z: cz }, b: { x: max.x + o, z: cz }, side: { x: cx, z: cz - 1 } };
  const alongZ: SectionProposal = { key: 'scan-z', through: 'scan-z', label: resolve('names.scan.sectionAlongZ'), a: { x: cx, z: max.z + o }, b: { x: cx, z: min.z - o }, side: { x: cx + 1, z: cz } };
  return max.x - min.x >= max.z - min.z ? [alongX, alongZ] : [alongZ, alongX];
}

/** The scan's sections, on the plan of its lowest level, made if missing; a section of a scan draws its cut only. */
export function ensureScanSections(levels: readonly ScanLevel[], bounds: AxisBounds, onOpen: boolean, centre?: { x: number; z: number } | null): { added: number; existing: number } {
  const out = { added: 0, existing: 0 };
  const { views } = useProjectStore.getState();
  if (onOpen && views.some((v) => v.kind === 'section')) return out;
  const lowest = [...levels].sort((a, b) => a.elevation - b.elevation)[0];
  const plan = lowest ? scanPlanOf(lowest.id) : undefined;
  if (!plan) return out;
  for (const proposal of scanSectionProposals(bounds, centre)) {
    if (useProjectStore.getState().views.some((v) => v.kind === 'section' && v.through === proposal.label)) { out.existing++; continue; }
    const id = createProposedSection(plan, [], proposal);
    if (!id) continue;
    updateProjectView(id, { viewDepth: 0 });
    out.added++;
  }
  return out;
}

/**
 * Set the scan's levels: saved with the project, each level's plan moved and
 * renamed with it (a plan renamed by hand keeps its name), a plan made for a
 * new level and the plan of a level taken away removed. Returns the plans added.
 */
export function setScanLevels(levels: readonly ScanLevel[]): string[] {
  const before = useProjectStore.getState().scanLevels ?? [];
  const clean = levels.filter((l) => l.name.trim() && Number.isFinite(l.elevation)).map((l) => ({ id: l.id, name: l.name.trim(), elevation: l.elevation }));
  useProjectStore.setState({ scanLevels: clean, dirty: true });
  for (const level of clean) {
    const plan = scanPlanOf(level.id);
    if (!plan) continue;
    const was = before.find((l) => l.id === level.id);
    if (plan.level.name === level.name && plan.level.elevation === level.elevation) continue;
    updateProjectView(plan.id, { level: levelOf(level), ...(was && plan.name === was.name ? { name: level.name } : {}) });
  }
  for (const gone of before.filter((b) => !clean.some((l) => l.id === b.id))) {
    const plan = scanPlanOf(gone.id);
    if (plan) removeProjectItem(plan.id);
  }
  return ensureScanPlans(clean).added;
}
