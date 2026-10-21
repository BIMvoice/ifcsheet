/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The first thing after a model opens: no empty page, the set is already
 * drawn. What was read, how many sheets and views, and the way onto the Wall.
 */

import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { formatLocaleFixed, useTranslation } from '@/i18n';
import type { ModelExtent } from '@/project/drawing-set';
import { useProjectStore } from '@/project/project-store';
import { TOUR_ANCHORS, tourAnchor } from '@/lib/tours/anchors';
import { RecoveryOffer } from './RecoveryOffer';
import { ReadinessList } from '../sheets/ReadinessList';
import { WALL_SKIN } from '../sheets/set-skin';

function Chip({ children }: { children: string }) {
  return <span className="rounded-full border border-sky-300/30 px-4 py-1.5 text-sm text-sky-100">{children}</span>;
}

export function WallIntro({ modelName, extent, onHang, scan = false }: { modelName: string; extent: ModelExtent; onHang: () => void; scan?: boolean }) {
  const { t, locale } = useTranslation();
  const sheets = useProjectStore((s) => s.sheets);
  const levels = useProjectStore((s) => s.levels);
  const scanLevels = useProjectStore((s) => s.scanLevels);
  const views = new Set(sheets.flatMap((s) => (s.viewports ?? []).map((v) => v.viewId))).size;
  const w = formatLocaleFixed(locale, extent.max.x - extent.min.x, 1);
  const d = formatLocaleFixed(locale, extent.max.z - extent.min.z, 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Enter on a button of a panel that keeps its own keys (the tour card) is that button's.
      if (e.target instanceof Element && e.target.closest('[data-owns-keys]')) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') onHang();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHang]);

  return (
    <div className="flex h-full items-center px-16">
      <div className="max-w-2xl">
        <RecoveryOffer onRestored={onHang} />
        <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-sky-400">{t('wall.intro.read', { name: modelName })}</p>
        <h1 className="m-0 text-6xl font-light leading-tight text-white">
          {t('wall.intro.titleStart')}
          <br />
          <span className="text-sky-400">{t('wall.intro.titleEnd')}</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-sky-100/80">{t(scan ? 'wall.scan.intro.body' : 'wall.intro.body', { views, sheets: sheets.length })}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Chip>{scan ? t('wall.scan.intro.levels', { count: scanLevels?.length ?? 0 }) : t('wall.intro.storeys', { count: levels.length })}</Chip>
          <Chip>{t('wall.intro.extent', { w, d })}</Chip>
          <Chip>{t('wall.intro.sheets', { count: sheets.length })}</Chip>
          <Chip>{t('wall.intro.views', { count: views })}</Chip>
        </div>
        {/* What a model is missing for its set (storeys, rooms, materials) is not what a scan lacks: the body says that. */}
        {scan ? null : <div className="mt-6 max-w-lg"><ReadinessList skin={WALL_SKIN} compact /></div>}
        <button type="button" {...tourAnchor(TOUR_ANCHORS.wallHang)} onClick={onHang} className="mt-10 inline-flex items-center gap-3 rounded-md bg-sky-600 px-6 py-3 text-lg text-white hover:bg-sky-500">
          {t('wall.intro.hang')} <ArrowRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
