/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall before the set is laid out: how far the model has been read, then,
 * for a scan, how far its points have been gathered (#181); and in words why
 * nothing can be drawn when the file did not load or the scan holds no points.
 */

import { useTranslation } from '@/i18n';
import { useScanState } from '@/scan/scan-start';
import { useViewerStore } from '@/store';

export function WallWaiting({ scan }: { scan: boolean }) {
  const { t } = useTranslation();
  const progress = useViewerStore((s) => s.progress);
  const failed = useViewerStore((s) => [...s.models.values()].find((m) => m.loadState === 'error' && m.loadError !== 'cancelled'));
  const { phase, progress: gathered, error } = useScanState();
  const percent = (share: number) => Math.max(0, Math.min(100, Math.round(share)));
  const text = failed
    ? t('wall.loadFailed', { detail: failed.loadError ?? '' })
    : scan && phase === 'empty'
      ? t('wall.scan.empty')
      : scan && phase === 'error'
        ? t('wall.scan.error', { detail: error ?? '' })
        : scan
          ? t('wall.scan.gathering', { percent: percent(gathered * 100) })
          : progress && progress.percent > 0 && progress.percent < 100 && !progress.indeterminate
            ? t('wall.intro.reading', { percent: percent(progress.percent) })
            : t('wall.intro.waiting');
  return (
    <div className="flex h-full items-center justify-center px-8 text-center text-lg text-sky-200/80">
      <output className="m-0 block max-w-xl">{text}</output>
    </div>
  );
}
