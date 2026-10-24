/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's fields on the Wall. Without a sheet it fills them once
 * for every sheet (in the project drawer), logo included; with a sheet it
 * shows what that sheet prints, and a field typed there is that sheet's own
 * until it is put back to the project's value.
 */

import { useState } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { clearTitleBlockField, setProjectTitleBlockField, setTitleBlockField } from '@/project/sheets';
import { LOGO_FIELD, LOGO_MAX_BYTES, TITLE_BLOCK_FIELDS, titleBlockOf, type TitleBlockField } from '@/project/title-block';
import { lacksProjectData, useEffectiveTitleBlock, useResolvedTitleBlock } from '@/project/title-block-model';
import { fieldsWithoutSource } from '@/project/title-block-sources';
import { useViewerStore } from '@/store';
import type { ProjectSheet } from '@/project/types';
import { SourceBadge, SourcePicker } from './TitleBlockSource';
import { ProjectParams, SheetParams } from './TitleBlockParams';
import { TitleBlockLayout } from './TitleBlockLayout';
import { WALL_CARD, WALL_FIELD, WALL_PILL } from './wall-type';

const LABELS: Record<TitleBlockField, TranslationKey> = {
  project: 'sheets.tb.project',
  address: 'sheets.tb.address',
  client: 'sheets.tb.client',
  organisation: 'sheets.tb.organisation',
  drawnBy: 'sheets.tb.drawnBy',
  checkedBy: 'sheets.tb.checkedBy',
  date: 'sheets.tb.date',
};

const field = WALL_FIELD;
const quiet = WALL_PILL;

function Logo() {
  const { t } = useTranslation();
  const logo = useProjectStore((s) => s.titleBlock?.[LOGO_FIELD]);
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (file: File): void => {
    if (file.size > LOGO_MAX_BYTES) {
      setProblem(t('wall.tb.logoTooBig', { kb: Math.round(LOGO_MAX_BYTES / 1024) }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProblem(null);
        setProjectTitleBlockField(LOGO_FIELD, reader.result);
      }
    };
    reader.onerror = () => {
      console.warn('[ifcsheet] could not read the logo', reader.error);
      setProblem(t('wall.tb.logoUnreadable'));
    };
    reader.readAsDataURL(file);
  };
  return (
    <div className="mt-3 text-sm text-sky-200">
      {t('wall.tb.logo')}
      <div className="mt-1 flex items-center gap-2">
        {logo ? <img src={logo} alt={t('wall.tb.logo')} className="h-10 max-w-[120px] rounded bg-white object-contain p-1" /> : null}
        <label className={`${quiet} cursor-pointer`}>
          {logo ? t('wall.tb.logoReplace') : t('wall.tb.logoAdd')}
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) pick(file);
          }} />
        </label>
        {logo ? <button type="button" className={quiet} onClick={() => setProjectTitleBlockField(LOGO_FIELD, '')}>{t('wall.tb.logoRemove')}</button> : null}
      </div>
      {problem ? <p role="alert" className="m-0 mt-1 text-xs text-amber-300">{problem}</p> : null}
    </div>
  );
}

/** `sheet` absent: the fields every sheet prints. Present: what that sheet prints, and its own fields. */
export function TitleBlockForm({ sheet }: { sheet?: ProjectSheet }) {
  const { t } = useTranslation();
  const projectFields = useEffectiveTitleBlock();
  const resolved = useResolvedTitleBlock();
  const custom = useProjectStore((s) => s.titleBlockSources);
  const projectName = useProjectStore((s) => s.name);
  const shown = sheet ? titleBlockOf(sheet, projectFields, projectName) : projectFields;
  const own = sheet?.titleBlock ?? {};
  // A model with no IFC project fills only the project name (from its file) and the date: say which fields are left to type.
  const models = useViewerStore((s) => s.models);
  const missing = !sheet && models.size > 0 && lacksProjectData() ? fieldsWithoutSource(TITLE_BLOCK_FIELDS, resolved) : [];

  // A field takes a typed value only when it says something else than it shows now: leaving a field the model fills must not copy the model's value in as typed.
  const commit = (key: TitleBlockField, value: string): void => {
    if (value.trim() === (shown[key] ?? '')) return;
    if (!sheet) setProjectTitleBlockField(key, value.trim());
    else setTitleBlockField(sheet.id, key, value.trim());
  };

  return (
    <div>
      {missing.length > 0 ? <p role="note" className="m-0 text-xs text-amber-300">{t('wall.tb.missing', { fields: missing.map((k) => t(LABELS[k])).join(', ') })}</p> : null}
      {TITLE_BLOCK_FIELDS.map((key) => {
        const value = shown[key] ?? '';
        const isOwn = key in own;
        return (
          <div key={key} className="mt-2 text-sm text-sky-200">
            <label className="block">
              <span className="flex items-baseline gap-2">
                {t(LABELS[key])}
                {isOwn ? <span className="text-2xs text-amber-300">{t('wall.tb.ownField')}</span> : <SourceBadge resolved={resolved[key]} />}
              </span>
              <input
                // Typed elsewhere (the other form, a project opened): show the new value.
                key={`${key}:${value}`}
                className={field}
                defaultValue={value}
                placeholder={key === 'project' && !sheet ? projectName : undefined}
                onBlur={(e) => commit(key, e.target.value)}
                data-owns-keys
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </label>
            {sheet ? null : <SourcePicker field={key} fieldLabel={t(LABELS[key])} custom={custom} resolved={resolved[key]} />}
            {sheet && isOwn ? (
              <button type="button" className={`${quiet} mt-1`} onClick={() => clearTitleBlockField(sheet.id, key)}>{t('wall.tb.useProject')}</button>
            ) : null}
          </div>
        );
      })}
      {sheet ? <p className="m-0 mt-3 text-xs text-sky-300/80">{t('revision.tbDerived')}</p> : <Logo />}
      {sheet ? <SheetParams sheet={sheet} /> : <ProjectParams />}
      {sheet ? null : <TitleBlockLayout />}
    </div>
  );
}

/** The card at the right of a stepped-into sheet: this sheet's title block. */
export function TitleBlockCard({ sheet, onClose }: { sheet: ProjectSheet; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <aside aria-label={t('wall.tb.title')} className={`max-h-[calc(100vh-12rem)] overflow-y-auto ${WALL_CARD}`}>
      <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.tb.title')}</p>
      <p className="mb-2 mt-2 text-sm leading-relaxed text-sky-200">{t('wall.tb.sheetHint', { number: sheet.number })}</p>
      <TitleBlockForm sheet={sheet} />
      <button type="button" className={`${quiet} mt-4`} onClick={onClose}>{t('wall.tb.done')}</button>
    </aside>
  );
}
