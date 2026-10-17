/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project, in IfcSheet's own terms: a drawer over the left of the Wall
 * listing the sheets (by series), the drawings (plans, sections, elevations),
 * the schedules and the legends. A click goes there: a sheet is stepped into, a drawing
 * is brought forward on the sheet it hangs on (hung first if it is not), a
 * schedule likewise. Double-click renames, the cross deletes. New, open and
 * save the project file are at the top; the title block every sheet prints
 * is filled under the sheets.
 */

import { useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { sheetGroup, type ModelExtent } from '@/project/drawing-set';
import { addScheduleToSet, hangLegend, hangSchedule, hangView } from '@/project/drawing-set-actions';
import { requestNewProject } from '@/project/new-project';
import { exportProjectFile, importProjectFile, PROJECT_FILE_SUFFIX } from '@/project/project-file';
import { addProjectSheet, loadProjectDocument, projectDocument, removeProjectItem, renameProjectItem, setSheetNumber, useProjectStore } from '@/project/project-store';
import { sheetsShowing } from '@/project/sheets';
import type { ProjectViewKind } from '@/project/types';
import { TitleBlockForm } from './TitleBlockForm';
import { stepInto } from './wall-nav';
import { LibraryPanel } from './LibraryPanel';
import { LegendsAdd } from './LegendsAdd';

const DRAWING_KINDS: { kind: Exclude<ProjectViewKind, '3d'>; labelKey: TranslationKey }[] = [
  { kind: 'plan', labelKey: 'wall.group.plans' },
  { kind: 'section', labelKey: 'wall.group.sections' },
  { kind: 'elevation', labelKey: 'wall.group.elevations' },
];

const action = 'rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70';

function Group({ title, children, add }: { title: string; children: ReactNode; add?: ReactNode }) {
  return (
    <section className="border-t border-sky-300/10 px-4 py-3">
      <h3 className="m-0 mb-1.5 text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{title}</h3>
      <ul className="m-0 list-none p-0">{children}</ul>
      {add ? <div className="mt-2 flex flex-wrap gap-1.5">{add}</div> : null}
    </section>
  );
}

function Row({ id, label, sub, onOpen }: { id: string; label: string; sub?: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  return (
    <li className="group flex items-center gap-1 rounded-md hover:bg-sky-400/10">
      {editing ? (
        <input
          // A rename is what the double-click asked for: the field takes the keys at once.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          defaultValue={label}
          aria-label={t('wall.project.rename')}
          className="m-0.5 min-w-0 flex-1 rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-sm text-white"
          onBlur={(e) => {
            renameProjectItem(id, e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <button type="button" onClick={onOpen} onDoubleClick={() => setEditing(true)} title={t('wall.project.renameHint')} className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-sky-50">
          {sub ? <span className="mr-2 font-semibold text-white">{sub}</span> : null}
          {label}
        </button>
      )}
      <button type="button" aria-label={t('wall.remove', { name: label })} onClick={() => removeProjectItem(id)} className="mr-1 rounded p-1 text-sky-200 opacity-0 hover:bg-sky-400/20 group-hover:opacity-100 focus-visible:opacity-100">
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function ProjectDrawer({ extent, onClose }: { extent: ModelExtent | null; onClose: () => void }) {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.name);
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const legends = useProjectStore((s) => s.legends ?? []);
  const fileInput = useRef<HTMLInputElement>(null);

  const go = (sheetId: string | null, focus: string | null = null): void => {
    if (!sheetId) return;
    stepInto(sheetId, focus);
    onClose();
  };
  /** A blank sheet, numbered past the set's series (A-901…), for whatever does not fit them. */
  const newSheet = (): void => {
    const taken = new Set(sheets.map((s) => s.number));
    let n = 901;
    while (taken.has(`A-${n}`)) n++;
    const id = addProjectSheet(t('wall.project.newSheet'));
    setSheetNumber(id, `A-${n}`);
    go(id);
  };
  const openDrawing = (viewId: string): void => {
    const hung = sheetsShowing(viewId)[0]?.id ?? (extent ? hangView(viewId, extent) : null);
    go(hung, viewId);
  };
  const series: { group: ReturnType<typeof sheetGroup>; labelKey: TranslationKey }[] = [
    { group: 'plans', labelKey: 'wall.group.plans' },
    { group: 'elevations', labelKey: 'wall.group.elevations' },
    { group: 'sections', labelKey: 'wall.group.sections' },
    { group: 'schedules', labelKey: 'wall.group.schedules' },
    { group: null, labelKey: 'wall.group.other' },
  ];

  return (
    <aside aria-label={t('wall.project.title')} className="absolute inset-y-0 left-0 z-20 flex w-80 flex-col border-r border-sky-300/20 bg-[#08214a]/98 text-sky-50 shadow-2xl">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] uppercase tracking-[0.25em] text-cyan-400">{t('wall.project.title')}</p>
          <p className="m-0 truncate text-lg text-white">{name}</p>
        </div>
        <button type="button" aria-label={t('wall.add.close')} onClick={onClose} className="rounded p-1 text-sky-200 hover:bg-sky-400/20"><X className="size-4" /></button>
      </header>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        <button type="button" className={action} onClick={requestNewProject}>{t('wall.project.new')}</button>
        <button type="button" className={action} onClick={() => fileInput.current?.click()}>{t('wall.project.open')}</button>
        <button type="button" className={action} onClick={() => { exportProjectFile(projectDocument()); useProjectStore.setState({ dirty: false }); }}>{t('wall.shell.saveProject')}</button>
        <input ref={fileInput} type="file" accept={`${PROJECT_FILE_SUFFIX},application/json`} className="hidden" onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importProjectFile(file).then((doc) => loadProjectDocument(doc, { dirty: false })).catch((err: unknown) => console.warn('[ifcsheet] could not open the project file', err));
        }} />
      </div>
      <LibraryPanel />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <Group title={t('wall.project.sheets')} add={<button type="button" className={action} onClick={newSheet}>{t('wall.project.addSheet')}</button>}>
          {series.flatMap(({ group }) => sheets.filter((s) => sheetGroup(s) === group)).map((s) => (
            <Row key={s.id} id={s.id} sub={s.number} label={s.name} onOpen={() => go(s.id)} />
          ))}
        </Group>
        <details className="border-t border-sky-300/10 px-4 py-3">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{t('wall.tb.title')}</summary>
          <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('wall.tb.everySheet')}</p>
          <TitleBlockForm />
        </details>
        {DRAWING_KINDS.map(({ kind, labelKey }) => (
          <Group key={kind} title={t(labelKey)}>
            {views.filter((v) => v.kind === kind).map((v) => <Row key={v.id} id={v.id} label={v.name} onOpen={() => openDrawing(v.id)} />)}
          </Group>
        ))}
        <Group
          title={t('wall.group.schedules')}
          add={(
            <>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('all', t('wall.project.joinerySchedule')))}>{t('wall.project.addJoinery')}</button>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('materials', t('takeoff.newName')))}>{t('wall.project.addTakeoff')}</button>
            </>
          )}
        >
          {schedules.map((s) => <Row key={s.id} id={s.id} label={s.name} onOpen={() => go(hangSchedule(s.id))} />)}
        </Group>
        <div data-owns-keys>
          <Group title={t('wall.group.legends')} add={<LegendsAdd onClose={onClose} />}>
            {legends.map((l) => <Row key={l.id} id={l.id} label={l.name} onOpen={() => go(sheetsShowing(l.id)[0]?.id ?? hangLegend(l.id))} />)}
          </Group>
        </div>
      </div>
    </aside>
  );
}
