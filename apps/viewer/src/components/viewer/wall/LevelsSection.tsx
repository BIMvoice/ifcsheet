/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project drawer's Levels: for a model that has no storeys (a glTF/GLB)
 * the person lists the levels (a name and the height of the floor), or takes
 * the ones found in the model's floors, and each gets a plan. Every change
 * makes the set whole again (`makeDraftSet`), so the new plans are on sheets.
 */

import { X } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { makeDraftSet } from '@/draft-set/run';
import { modelMeshes } from '@/draft-set/body';
import { detectLevels } from '@/project/level-detect';
import { useProjectStore } from '@/project/project-store';
import { addUserLevel, defaultLevelName, moveUserLevel, removeUserLevel, renameUserLevel, replaceUserLevels } from '@/project/user-levels';
import { useViewerStore } from '@/store';

const field = 'm-0.5 min-w-0 rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-sm text-white';
const action = 'rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70';

/** Whether to show the Levels: a model is loaded and none of the levels is a storey of it. */
export function useWantsUserLevels(): boolean {
  const loaded = useViewerStore((s) => s.models.size > 0);
  const hasStoreys = useProjectStore((s) => s.levels.some((l) => l.storeyGlobalIds.length > 0));
  return loaded && !hasStoreys;
}

export function LevelsSection({ lowest }: { lowest: number }) {
  const { t } = useTranslation();
  const userLevels = useProjectStore((s) => s.userLevels ?? []);
  const sorted = [...userLevels].sort((a, b) => a.elevation - b.elevation);
  const then = (): void => { makeDraftSet(); };
  const next = sorted.length > 0 ? Math.round((sorted[sorted.length - 1].elevation + 3) * 100) / 100 : Math.round(lowest * 100) / 100;
  return (
    <section aria-label={t('wall.levels.title')} className="border-t border-sky-300/10 px-4 py-3">
      <h3 className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{t('wall.levels.title')}</h3>
      <p className="m-0 mb-2 text-xs leading-relaxed text-sky-200">{t('wall.levels.hint')}</p>
      <ul className="m-0 list-none p-0">
        {sorted.map((level) => (
          <li key={`${level.id}:${level.name}:${level.elevation}`} className="group flex items-center gap-1">
            <input
              defaultValue={level.name}
              aria-label={t('wall.levels.name')}
              className={`${field} flex-1`}
              onBlur={(e) => { if (renameUserLevel(level.id, e.target.value)) then(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
            <input
              type="number"
              step="0.1"
              defaultValue={level.elevation}
              aria-label={t('wall.levels.elevation')}
              className={`${field} w-20`}
              onBlur={(e) => { if (e.target.value !== '' && moveUserLevel(level.id, Number(e.target.value))) then(); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
            <button type="button" aria-label={t('wall.remove', { name: level.name })} onClick={() => { removeUserLevel(level.id); then(); }} className="rounded p-1 text-sky-200 hover:bg-sky-400/20">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className={action} onClick={() => { addUserLevel(defaultLevelName(sorted.length + 1), next); then(); }}>{t('wall.levels.add')}</button>
        <button type="button" className={action} onClick={() => { replaceUserLevels(detectLevels(modelMeshes())); then(); }}>{t('wall.levels.detect')}</button>
      </div>
    </section>
  );
}
