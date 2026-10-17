/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for a placed legend: its title, its columns and
 * the categories it lists, as large toggles. Each change is the legend's own
 * (`legend-actions`), so it shows on every sheet the legend is placed on.
 */

import type { ProjectLegend } from '@/catalogue/types';
import { useTranslation } from '@/i18n';
import { keepLegendOnSheets, toggleLegendCategory, updateLegend } from '@/legend/legend-actions';
import { useLegendLabels } from '../legend/LegendGraphic';
import { CategoryToggles } from './CategoryToggles';

const field = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-base text-white';

export function LegendCard({ legend }: { legend: ProjectLegend }) {
  const { t } = useTranslation();
  const labels = useLegendLabels();
  /** A change goes through the legend's own actions, then the legend is kept on the paper where it is placed. */
  const change = (apply: () => void): void => {
    apply();
    keepLegendOnSheets(legend.id, labels);
  };
  return (
    <div data-owns-keys>
      <label className="mt-3 block text-sm text-sky-200">
        {t('wall.legend.cardTitle')}
        <input
          key={legend.id}
          className={field}
          defaultValue={legend.title}
          onBlur={(e) => e.target.value !== legend.title && change(() => updateLegend(legend.id, { title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </label>
      <label className="mt-3 block text-sm text-sky-200">
        {t('wall.legend.columns')}
        <select className={field} value={legend.columns} onChange={(e) => change(() => updateLegend(legend.id, { columns: Number(e.target.value) }))}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <p className="m-0 mt-3 text-sm text-sky-200">{t('wall.legend.listsLabel')}</p>
      <CategoryToggles value={legend.categories} onToggle={(c) => change(() => toggleLegendCategory(legend.id, c))} />
    </div>
  );
}
