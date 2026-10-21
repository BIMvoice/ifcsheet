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

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { useTranslation, type TranslationKey } from '@/i18n';
import { inSetOrder } from '@/project/drawing-register';
import { sheetGroup, type ModelExtent } from '@/project/drawing-set';
import { addRegisterToSet, addScheduleToSet, hangLegend, hangSchedule, hangView } from '@/project/drawing-set-actions';
import { projectOpenErrorText } from '@/project/open-error';
import { requestNewProject } from '@/project/new-project';
import { exportProjectFile, importProjectFile, openProjectDocument, PROJECT_FILE_SUFFIX } from '@/project/project-file';
import { addProjectSheet, projectDocument, removeProjectItem, renameProjectItem, useProjectStore } from '@/project/project-store';
import { paperLabel } from '@/project/paper';
import { allTemplates } from '@/project/sheet-templates';
import { sheetsShowing } from '@/project/sheets';
import type { ProjectViewKind } from '@/project/types';
import { useViewerStore } from '@/store';
import { modelSiteArea } from '@/urban/urban-models';
import { SheetNumberingForm } from './SheetNumberingForm';
import { useViewDrawings } from '@/project/view-drawings';
import { viewportState, type ViewportState as ViewportStateValue } from '@/project/viewport-state';
import { RecoveryOffer } from './RecoveryOffer';
import { ReadinessList } from '../sheets/ReadinessList';
import { WALL_SKIN } from '../sheets/set-skin';
import { TitleBlockForm } from './TitleBlockForm';
import { LevelsSection, useWantsUserLevels } from './LevelsSection';
import { stepInto } from './wall-nav';
import { LibraryPanel } from './LibraryPanel';
import { CommentsSection } from './CommentsSection';
import { LegendsAdd } from './LegendsAdd';
import { SiteAreaField } from '../urban/SiteAreaField';
import { ViewportState } from './ViewportState';
import { TagFieldsPanel } from './TagFieldsPanel';

const DRAWING_KINDS: { kind: Exclude<ProjectViewKind, '3d'>; labelKey: TranslationKey }[] = [
  { kind: 'plan', labelKey: 'wall.group.plans' },
  { kind: 'section', labelKey: 'wall.group.sections' },
  { kind: 'elevation', labelKey: 'wall.group.elevations' },
  { kind: 'drafting', labelKey: 'wall.group.drafting' },
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

function Row({ id, label, sub, state, onOpen }: { id: string; label: string; sub?: string; state?: ViewportStateValue; onOpen: () => void }) {
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
      {state ? <ViewportState state={state} compact /> : null}
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
  const models = useViewerStore((s) => s.models);
  // models: what `modelSiteArea` reads.
  const siteFromModel = useMemo(() => modelSiteArea(), [models]);
  const ownTemplates = useProjectStore((s) => s.sheetTemplates);
  const [template, setTemplate] = useState('');
  const byView = useViewDrawings((s) => s.byView);
  const fileInput = useRef<HTMLInputElement>(null);
  const [readyOpen, setReadyOpen] = useState(false);
  const wantsLevels = useWantsUserLevels();

  const go = (sheetId: string | null, focus: string | null = null): void => {
    if (!sheetId) return;
    stepInto(sheetId, focus);
    onClose();
  };
  /** A blank sheet, numbered in the "other" series, for whatever does not fit the rest. */
  const newSheet = (): void => {
    go(addProjectSheet(t('wall.project.newSheet'), 'other', template || undefined));
  };
  const openDrawing = (viewId: string): void => {
    const hung = sheetsShowing(viewId)[0]?.id ?? (extent ? hangView(viewId, extent) : null);
    go(hung, viewId);
  };
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
          if (file) void importProjectFile(file).then((doc) => openProjectDocument(doc, { dirty: false })).catch((err: unknown) => { console.warn('[ifcsheet] could not open the project file', err); toast.error(projectOpenErrorText(err, t)); });
        }} />
      </div>
      <div className="px-4"><RecoveryOffer /></div>
      <LibraryPanel />
      <CommentsSection onGo={go} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <Group title={t('wall.project.sheets')} add={(
          <>
            <select aria-label={t('wall.paper.newSheetTemplate')} className={`${action} max-w-[9rem] bg-transparent`} value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">{t('wall.paper.noTemplate')}</option>
              {allTemplates(ownTemplates).map((tpl) => <option key={tpl.id} value={tpl.id}>{`${tpl.name} (${paperLabel(tpl.paper)})`}</option>)}
            </select>
            <button type="button" className={action} onClick={newSheet}>{t('wall.project.addSheet')}</button>
          </>
        )}>
          {inSetOrder(sheets, schedules).map((s) => (
            <Row key={s.id} id={s.id} sub={s.number} label={s.name} onOpen={() => go(s.id)} />
          ))}
        </Group>
        <details className="border-t border-sky-300/10 px-4 py-3" onToggle={(e) => setReadyOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{t('ready.title')}</summary>
          {/* Mounted only while open: reading the facts walks every entity of every model. */}
          {readyOpen ? <div className="mt-2 text-xs leading-relaxed"><ReadinessList skin={WALL_SKIN} /></div> : null}
        </details>
        <details className="border-t border-sky-300/10 px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.25em] text-cyan-400">{t('wall.num.title')}</summary>
          <SheetNumberingForm />
        </details>
        <details className="border-t border-sky-300/10 px-4 py-3">
          <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[0.25em] text-cyan-400">{t('wall.tb.title')}</summary>
          <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('wall.tb.everySheet')}</p>
          <TitleBlockForm />
        </details>
        {wantsLevels ? <LevelsSection lowest={extent?.min.y ?? 0} /> : null}
        <TagFieldsPanel />
        {DRAWING_KINDS.map(({ kind, labelKey }) => (
          <Group key={kind} title={t(labelKey)}>
            {views.filter((v) => v.kind === kind).map((v) => <Row key={v.id} id={v.id} label={v.name} state={viewportState(byView[v.id], v.kind)} onOpen={() => openDrawing(v.id)} />)}
          </Group>
        ))}
        <Group
          title={t('wall.group.schedules')}
          add={(
            <>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('all', t('wall.project.joinerySchedule')))}>{t('wall.project.addJoinery')}</button>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('materials', t('takeoff.newName')))}>{t('wall.project.addTakeoff')}</button>
              <button type="button" className={action} onClick={() => go(addRegisterToSet(t('register.name')))}>{t('wall.project.addRegister')}</button>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('types', t('typeQty.newName')))}>{t('wall.project.addTypeQuantities')}</button>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('finishes', t('finishes.newName')))}>{t('wall.project.addFinishes')}</button>
              <button type="button" className={action} onClick={() => go(addScheduleToSet('urban', t('urban.newName')))}>{t('urban.add')}</button>
              <SiteAreaField
                modelSiteArea={siteFromModel}
                className="mt-1 flex w-full items-center justify-between gap-2 text-xs text-sky-200"
                inputClassName="w-36 rounded border border-sky-300/40 bg-[#061a36] px-1.5 py-1 text-xs text-white"
              />
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
