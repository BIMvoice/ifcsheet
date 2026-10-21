/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The levels a person defines for a model that has no storeys (a glTF/GLB):
 * add, rename, move, delete, or take the ones `level-detect.ts` finds. They
 * are the project's (`ProjectDocument.userLevels`, saved with it) and join the
 * storeys of the loaded models as levels (`levelsWithUser`), so each gets a
 * plan. A plan already made for a level that is renamed or moved follows it;
 * deleting a level leaves its plan, as every other view is left until deleted.
 */

import { resolve } from '@/i18n/registry';
import { resyncLevels, useProjectStore } from './project-store';
import { freshProjectId, planCutHeight, sameElevation, uniqueViewName } from './view-defaults';
import type { PlanProjectView, ProjectView, UserLevel } from './types';

const levelsNow = (): UserLevel[] => useProjectStore.getState().userLevels ?? [];

/** The plans that were made for a level with no storeys at `elevation` (a plan follows a level by its height). */
const planOf = (v: ProjectView, elevation: number): v is PlanProjectView =>
  v.kind === 'plan' && !v.discipline && !v.detail && v.level.storeyGlobalIds.length === 0 && sameElevation(v.level.elevation, elevation);

function commit(userLevels: UserLevel[], views?: ProjectView[]): void {
  useProjectStore.setState({ userLevels, ...(views ? { views } : {}), dirty: true });
  resyncLevels();
  followLevels();
}

/**
 * What the plans the set made follow after the levels change. The plan a model with no levels was given (one at
 * mid-height) becomes the plan of the user level at its height: that level's name and cut. A plan whose cut would
 * now reach the level above (one was added close over it) is cut lower, never higher, so a cut the person set
 * stays. A plan the person made themselves is left alone.
 */
function followLevels(): void {
  const { views, levels, userLevels = [] } = useProjectStore.getState();
  let changed = false;
  const next = views.map((v) => {
    if (v.kind !== 'plan' || !v.auto || v.discipline || v.detail || v.level.storeyGlobalIds.length > 0) return v;
    const level = levels.find((l) => l.storeyGlobalIds.length === 0 && sameElevation(l.elevation, v.level.elevation));
    if (!level || !userLevels.some((u) => sameElevation(u.elevation, level.elevation))) return v;
    const cut = planCutHeight(level, levels);
    if (v.level.name === level.name) {
      if (v.cutHeight <= cut) return v;
      changed = true;
      return { ...v, cutHeight: cut };
    }
    changed = true;
    return { ...v, name: uniqueViewName(level.name, views.filter((o) => o.id !== v.id)), cutHeight: cut, level: { ...v.level, name: level.name } };
  });
  if (changed) useProjectStore.setState({ views: next, dirty: true });
}

/** "Level 3", in the language of the interface. */
export const defaultLevelName = (n: number): string => resolve('wall.levels.defaultName', { n });

export function addUserLevel(name: string, elevation: number): string | null {
  const trimmed = name.trim();
  if (!trimmed || !Number.isFinite(elevation)) return null;
  const id = freshProjectId('level');
  commit([...levelsNow(), { id, name: trimmed, elevation }]);
  return id;
}

/** Returns whether anything changed. */
export function renameUserLevel(id: string, name: string): boolean {
  const trimmed = name.trim();
  const found = levelsNow().find((l) => l.id === id);
  if (!trimmed || !found || found.name === trimmed) return false;
  const { views } = useProjectStore.getState();
  // The plan that carries the old name takes the new one; a plan the person named otherwise keeps its name.
  const renamed = views.map((v) => (planOf(v, found.elevation) ? { ...v, ...(v.name === found.name ? { name: uniqueViewName(trimmed, views.filter((o) => o.id !== v.id)) } : {}), level: { ...v.level, name: trimmed } } : v));
  commit(levelsNow().map((l) => (l.id === id ? { ...l, name: trimmed } : l)), renamed);
  return true;
}

/** Returns whether anything changed. */
export function moveUserLevel(id: string, elevation: number): boolean {
  const found = levelsNow().find((l) => l.id === id);
  if (!found || !Number.isFinite(elevation) || elevation === found.elevation) return false;
  const { views } = useProjectStore.getState();
  const moved = views.map((v) => (planOf(v, found.elevation) ? { ...v, level: { ...v.level, elevation } } : v));
  commit(levelsNow().map((l) => (l.id === id ? { ...l, elevation } : l)), moved);
  return true;
}

export function removeUserLevel(id: string): void {
  if (levelsNow().some((l) => l.id === id)) commit(levelsNow().filter((l) => l.id !== id));
}

/** Take `found` as the project's levels, named "Level 1", "Level 2"… from the lowest. */
export function replaceUserLevels(found: readonly { elevation: number }[]): void {
  commit(found.map((f, i) => ({ id: freshProjectId('level'), name: defaultLevelName(i + 1), elevation: f.elevation })));
}
