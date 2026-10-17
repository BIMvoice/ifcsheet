/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The "+ Legend" button of the drawer's Legends group, and the form it opens.
 * The group itself (its title and its rows: a click goes to the sheet the
 * legend is on, or hangs it on a sheet of its own; a double-click renames;
 * the cross deletes, which takes it off every sheet) is the drawer's, like
 * the others.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n';
import { libraryAction } from './library-style';
import { NewLegend } from './NewLegend';

export function LegendsAdd({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [making, setMaking] = useState(false);
  return (
    <>
      <button type="button" className={libraryAction} aria-pressed={making} onClick={() => setMaking((m) => !m)}>{t('wall.legend.add')}</button>
      {making ? <NewLegend onDone={(placedOn) => { setMaking(false); if (placedOn) onClose(); }} /> : null}
    </>
  );
}
