/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The five things a legend can list, as large toggles. One component for the
 * new-legend form (which holds the choice until the legend is made) and the
 * legend's viewport card (which changes the legend itself).
 */

import { LEGEND_CATEGORIES, type LegendCategory } from '@/catalogue/types';
import { useTranslation, type TranslationKey } from '@/i18n';

export function CategoryToggles({ value, onToggle }: { value: readonly LegendCategory[]; onToggle: (category: LegendCategory) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-1 grid grid-cols-2 gap-1.5">
      {LEGEND_CATEGORIES.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={value.includes(c)}
          onClick={() => onToggle(c)}
          className="rounded-xl border border-sky-300/30 px-3 py-2 text-left text-sm text-sky-100 hover:border-sky-300/70 aria-pressed:border-sky-300 aria-pressed:bg-sky-400/25 aria-pressed:text-white"
        >
          {t(`legend.category.${c}` as TranslationKey)}
        </button>
      ))}
    </div>
  );
}
