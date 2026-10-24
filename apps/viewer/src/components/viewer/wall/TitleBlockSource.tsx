/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where one title block field's value comes from, and the choice of it: the
 * badge beside the field ("from IfcProject.Name", "typed", "not in the
 * model") and, in the project drawer, a source picker and the way back to
 * the model. The mapping is the project's (`titleBlockSources`).
 */

import { useTranslation, type TranslationKey } from '@/i18n';
import { resetTitleBlockField, setTitleBlockSources } from '@/project/sheets';
import { PRESET_SOURCES, sameSource, sourceText, sourcesOf, type OwnerPart, type ResolvedField, type TitleSource, type TitleSources } from '@/project/title-block-sources';
import { WALL_PILL } from './wall-type';

const OWNER_LABELS: Record<OwnerPart, TranslationKey> = {
  organisation: 'wall.tbsrc.owner.organisation',
  person: 'wall.tbsrc.owner.person',
  application: 'wall.tbsrc.owner.application',
  developer: 'wall.tbsrc.owner.developer',
};

const select = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1 text-xs text-white';
const quiet = WALL_PILL;

/** A source as the person reads it in the picker. */
function useSourceLabel(): (s: TitleSource) => string {
  const { t } = useTranslation();
  return (s) => {
    if (s.kind === 'owner') return t(OWNER_LABELS[s.part]);
    if (s.kind === 'file') return t('wall.tbsrc.file');
    if (s.kind === 'actor') return t('wall.tbsrc.actor', { role: s.role });
    return sourceText(s);
  };
}

/** The badge: typed, or the source the model value came from, or the model's silence. */
export function SourceBadge({ resolved }: { resolved: ResolvedField | undefined }) {
  const { t } = useTranslation();
  const label = useSourceLabel();
  if (!resolved || resolved.from === 'none') return <span className="text-xs text-sky-400">{t('wall.tbsrc.none')}</span>;
  if (resolved.from === 'typed') return <span className="text-xs text-amber-300">{t('wall.tbsrc.typed')}</span>;
  return <span className="text-xs text-emerald-300">{t('wall.tbsrc.from', { source: resolved.source ? label(resolved.source) : '' })}</span>;
}

/** An IFC property path, as the file spells it: not a phrase to translate. */
const PATH_EXAMPLE = 'Pset_ProjectCommon.Reference';
const PSET = 'pset';
const DEFAULT = 'default';
/** No source: the field stays blank even where the model has a value. */
const NONE = 'none';

/** The picker for a project field: a source from the short list, a property path, or the default. */
export function SourcePicker({ field, fieldLabel, custom, resolved }: { field: string; fieldLabel: string; custom: TitleSources | undefined; resolved: ResolvedField | undefined }) {
  const { t } = useTranslation();
  const label = useSourceLabel();
  const list = custom?.[field];
  const chosen = list?.[0];
  const preset = chosen ? PRESET_SOURCES.findIndex((p) => sameSource(p, chosen)) : -1;
  // An empty list is the "none" choice; a field whose default is no source reads the same either way.
  const value = list === undefined ? DEFAULT : !chosen ? NONE : preset >= 0 ? String(preset) : PSET;
  const onPick = (v: string): void => {
    if (v === DEFAULT) setTitleBlockSources(field, undefined);
    else if (v === NONE) setTitleBlockSources(field, []);
    // A property needs its path first: the input below sets it.
    else if (v === PSET) setTitleBlockSources(field, [{ kind: 'pset', pset: '', property: '' }]);
    else setTitleBlockSources(field, [PRESET_SOURCES[Number(v)]]);
  };
  const path = chosen?.kind === 'pset' ? `${chosen.pset}${chosen.pset || chosen.property ? '.' : ''}${chosen.property}` : '';
  const onPath = (text: string): void => {
    const dot = text.indexOf('.');
    const pset = (dot < 0 ? text : text.slice(0, dot)).trim();
    const property = (dot < 0 ? '' : text.slice(dot + 1)).trim();
    setTitleBlockSources(field, pset && property ? [{ kind: 'pset', pset, property }] : undefined);
  };
  const changed = resolved?.from === 'typed' || custom?.[field] !== undefined;
  return (
    <div className="mt-1">
      <select aria-label={t('wall.tbsrc.pick', { field: fieldLabel })} data-owns-keys className={select} value={value} onChange={(e) => onPick(e.target.value)}>
        <option value={DEFAULT}>{`${t('wall.tbsrc.default')}: ${sourcesOf(undefined, field).map(label).join(', ') || '—'}`}</option>
        <option value={NONE}>{t('wall.tbsrc.noSource')}</option>
        {PRESET_SOURCES.map((s, i) => <option key={sourceText(s)} value={String(i)}>{label(s)}</option>)}
        <option value={PSET}>{t('wall.tbsrc.property')}</option>
      </select>
      {value === PSET ? (
        <input
          key={path}
          aria-label={t('wall.tbsrc.propertyPath', { field: fieldLabel })}
          data-owns-keys
          className={select}
          defaultValue={path}
          placeholder={PATH_EXAMPLE}
          onBlur={(e) => onPath(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      ) : null}
      {changed ? <button type="button" data-owns-keys className={`${quiet} mt-1`} onClick={() => resetTitleBlockField(field)}>{t('wall.tbsrc.reset')}</button> : null}
    </div>
  );
}
