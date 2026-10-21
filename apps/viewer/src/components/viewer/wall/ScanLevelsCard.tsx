/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A scan's levels in the project drawer (#181): a scan has no storeys, so the
 * user names its levels and sets the height of each floor; each level has a
 * plan, cut the standard height above it, which moves, is made or goes with
 * it (`applyScanLevels`). A field takes effect when it is left or Enter is
 * pressed; text that is not a height is refused and the stored value shown again.
 */

import { useId } from 'react';
import { X } from 'lucide-react';
import { formatLocaleFixed, useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { DEFAULT_PLAN_CUT_HEIGHT_M, freshProjectId } from '@/project/view-defaults';
import type { ScanLevel } from '@/scan/scan-levels';
import { applyScanLevels } from '@/scan/scan-start';

/** A typed height in metres: decimal point or comma, an optional sign and "m"; null for anything else. */
export function parseHeight(text: string): number | null {
  const s = text.trim().replace(/\s*m$/i, '').replace(',', '.');
  return /^[-+]?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

/** The height a level added on top takes: a storey of 3 m over the highest, or 0 for the first. */
const STOREY_M = 3;

const input = 'rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-xs text-white';

export function ScanLevelsCard() {
  const { t, locale } = useTranslation();
  const id = useId();
  const levels = useProjectStore((s) => s.scanLevels) ?? [];
  const change = (levelId: string, patch: Partial<ScanLevel>) => applyScanLevels(levels.map((l) => (l.id === levelId ? { ...l, ...patch } : l)));
  const commit = (e: { key: string; currentTarget: HTMLInputElement }) => { if (e.key === 'Enter') e.currentTarget.blur(); };
  const top = Math.max(-Infinity, ...levels.map((l) => l.elevation));
  const add = () => applyScanLevels([...levels, { id: freshProjectId('level'), name: t('names.scan.level', { n: levels.length }), elevation: levels.length ? Math.round((top + STOREY_M) * 100) / 100 : 0 }]);

  return (
    <section className="border-t border-sky-300/10 px-4 py-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{t('wall.scan.levels')}</h3>
      <p className="m-0 mb-2 text-xs text-sky-200/80">{t('wall.scan.levels.hint', { height: formatLocaleFixed(locale, DEFAULT_PLAN_CUT_HEIGHT_M, 1) })}</p>
      <ul className="m-0 list-none p-0">
        {[...levels].sort((a, b) => b.elevation - a.elevation).map((level) => (
          // Keyed on the stored values: a refused entry, or another project opened, puts the fields back in step.
          <li key={`${level.id}:${level.name}:${level.elevation}`} className="flex items-center gap-1.5 py-0.5">
            <input
              aria-label={t('wall.scan.level.name')} type="text" defaultValue={level.name} className={`${input} min-w-0 flex-1`}
              onKeyDown={commit}
              onBlur={(e) => { const name = e.currentTarget.value.trim(); if (name && name !== level.name) change(level.id, { name }); else e.currentTarget.value = level.name; }}
            />
            <input
              aria-label={t('wall.scan.level.elevation')} type="text" inputMode="decimal" defaultValue={formatLocaleFixed(locale, level.elevation, 2)} className={`${input} w-20 text-right`}
              onKeyDown={commit}
              onBlur={(e) => {
                const elevation = parseHeight(e.currentTarget.value);
                if (elevation !== null && elevation !== level.elevation) change(level.id, { elevation });
                else e.currentTarget.value = formatLocaleFixed(locale, level.elevation, 2);
              }}
            />
            <button type="button" aria-label={t('wall.scan.level.remove', { name: level.name })} disabled={levels.length < 2} className="rounded p-1 text-sky-300/70 hover:text-white disabled:opacity-30" onClick={() => applyScanLevels(levels.filter((l) => l.id !== level.id))}>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70" onClick={add}>{t('wall.scan.level.add')}</button>
    </section>
  );
}
