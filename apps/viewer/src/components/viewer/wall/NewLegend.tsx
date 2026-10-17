/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The short form behind the Legends "+": a name, the categories as large
 * toggles (materials and hatches to start), and what it covers: the whole
 * project, or the sheet that is open. Made while a sheet is open, the legend
 * is put on that sheet at once. Everything goes through `legend-actions`; the
 * form keeps its keys (`data-owns-keys`) and touches nothing of a running tool.
 */

import { useEffect, useRef, useState } from 'react';
import type { LegendCategory } from '@/catalogue/types';
import { useTranslation } from '@/i18n';
import { addLegend, placeLegend } from '@/legend/legend-actions';
import { useProjectStore } from '@/project/project-store';
import { useLegendLabels } from '../legend/LegendGraphic';
import { CategoryToggles } from './CategoryToggles';
import { libraryAction as action } from './library-style';
import { useWallNav } from './wall-nav';

const START: LegendCategory[] = ['materials', 'hatches'];

export function NewLegend({ onDone }: { onDone: (placedOn: string | null) => void }) {
  const { t } = useTranslation();
  const labels = useLegendLabels();
  const open = useWallNav((s) => s.stepped);
  const sheet = useProjectStore((s) => s.sheets.find((x) => x.id === open));
  const [name, setName] = useState(() => t('legend.newName'));
  const [categories, setCategories] = useState<LegendCategory[]>(START);
  const [onSheet, setOnSheet] = useState(false);
  const toggle = (c: LegendCategory): void => setCategories((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));
  const none = categories.length === 0;
  const form = useRef<HTMLFormElement>(null);
  // It opens at the foot of the drawer's list: bring it into view.
  useEffect(() => {
    form.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const create = (): void => {
    if (none) return;
    const id = addLegend(name.trim() || t('legend.newName'), onSheet && sheet ? { categories, scope: 'sheet', scopeId: sheet.id } : { categories });
    // A sheet that is open is where the legend is wanted: put it there straight away.
    if (sheet) placeLegend(sheet.id, id, labels);
    onDone(sheet?.id ?? null);
  };

  const scopeButton = 'rounded-xl border border-sky-300/30 px-3 py-2 text-left text-sm text-sky-100 hover:border-sky-300/70 aria-pressed:border-sky-300 aria-pressed:bg-sky-400/25 aria-pressed:text-white';
  return (
    <form
      ref={form}
      className="mt-2 w-full space-y-3 rounded-xl border border-sky-300/20 bg-[#061a36]/60 p-3"
      data-owns-keys
      onSubmit={(e) => { e.preventDefault(); create(); }}
    >
      <label className="block text-xs text-sky-200">
        {t('wall.legend.nameLabel')}
        <input className="mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-sm text-white" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div>
        <p className="m-0 text-xs text-sky-200">{t('wall.legend.listsLabel')}</p>
        <CategoryToggles value={categories} onToggle={toggle} />
      </div>
      {sheet ? (
        <div>
          <p className="m-0 text-xs text-sky-200">{t('wall.legend.scopeLabel')}</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            <button type="button" className={scopeButton} aria-pressed={!onSheet} onClick={() => setOnSheet(false)}>{t('wall.legend.scopeProject')}</button>
            <button type="button" className={scopeButton} aria-pressed={onSheet} onClick={() => setOnSheet(true)}>{t('wall.legend.scopeSheet', { number: sheet.number })}</button>
          </div>
        </div>
      ) : null}
      {none ? <p className="m-0 text-xs text-amber-200">{t('wall.legend.needOne')}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={none} className={`${action} disabled:opacity-40`}>
          {sheet ? t('wall.legend.createPlace', { number: sheet.number }) : t('wall.legend.create')}
        </button>
        <button type="button" className={action} onClick={() => onDone(null)}>{t('wall.legend.cancel')}</button>
      </div>
    </form>
  );
}
