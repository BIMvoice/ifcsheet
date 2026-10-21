/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keeps the project in step with the loaded models, and autosaves it.
 *
 * Levels come from every loaded model's IfcBuildingStorey list (with
 * GlobalIds, so a plan survives a re-export that renumbers express ids).
 * The project autosaves to localStorage under the set of loaded model keys,
 * so reopening the same models restores their views; the
 * `.ifclite-project.json` file is the shareable copy.
 */

import { useEffect } from 'react';
import { useViewerStore } from '@/store';
import type { FederatedModel } from '@/store/types';
import { modelLevels } from './model-levels';
import { loadProjectDocument, resetProject, syncProjectWithModels, useProjectStore } from './project-store';
import type { StoreyInput } from './view-defaults';
import type { ProjectModelRef } from './types';
import { autosaveKey } from './project-saved';
import { watchProjectForAutosave } from './autosave-watch';
import { markSessionClosed, markSessionOpen, planAutosave } from './recovery';
import { noticeAutosaveTooNew } from './autosave-notice';
import { forgetRecoveryOffer, offerRecovery, restoreModelState } from './recovery-store';
import { restoreRasters } from './autosave-rasters';
import { keepProjectForNewVersion, modelVersionSwapActive } from './model-version';

interface StoreySource {
  spatialHierarchy?: { byStorey: ReadonlyMap<number, unknown>; storeyElevations: ReadonlyMap<number, number> } | null;
  entities: { getName(id: number): string | null; getGlobalId(id: number): string };
}

export function storeysOf(ds: StoreySource | null | undefined): StoreyInput[] {
  if (!ds?.spatialHierarchy) return [];
  const { byStorey, storeyElevations } = ds.spatialHierarchy;
  return Array.from(byStorey.keys(), (id) => ({
    name: ds.entities.getName(id) || `Storey #${id}`,
    elevation: storeyElevations.get(id) ?? 0,
    globalId: ds.entities.getGlobalId(id) || undefined,
  }));
}

/**
 * A model that is only meshes: a glTF/GLB, which has no IFC data store (the primary one keeps `null`). It has no
 * storeys, but it is a model of the project all the same: it gets the default views (the 3D view among them), the
 * levels the person defines for it, and an autosave slot. A LandXML or a point cloud is not this.
 */
export function isMeshOnlyModel(model: Pick<FederatedModel, 'ifcDataStore' | 'landXmlDocument' | 'geometryResult'>): boolean {
  return !model.ifcDataStore && !model.landXmlDocument && (model.geometryResult?.meshes.length ?? 0) > 0;
}

export function modelRef(model: Pick<FederatedModel, 'id' | 'name' | 'sourceContentHash'>): ProjectModelRef {
  return { key: model.sourceContentHash ?? model.name, name: model.name };
}

/** The project's models and the storeys they bring, as `useProjectSync` hands them to `syncProjectWithModels`. */
export function loadedModels(): { refs: ProjectModelRef[]; storeys: StoreyInput[] } {
  const { models, ifcDataStore } = useViewerStore.getState();
  if (models.size === 0) {
    return ifcDataStore ? { refs: [{ key: 'legacy', name: 'Model' }], storeys: storeysOf(ifcDataStore) } : { refs: [], storeys: [] };
  }
  const refs: ProjectModelRef[] = [];
  const storeys: StoreyInput[] = [];
  for (const model of models.values()) {
    if (!model.ifcDataStore && !isMeshOnlyModel(model)) continue;
    refs.push(modelRef(model));
    // Effective storeys: parsed ones not deleted, plus levels added in this session.
    storeys.push(...modelLevels(model.id));
  }
  return { refs, storeys };
}

/** Mount once: follows model loads and autosaves the project. */
export function useProjectSync(): void {
  useEffect(() => {
    let slot: string | null = null;
    // The slot in front holds a newer build's autosave: it is not written for as long as these models are in front.
    let readOnlySlot = false;

    const onModels = () => {
      const { refs, storeys } = loadedModels();
      if (refs.length === 0) return;
      const key = autosaveKey(refs);
      if (key !== slot) {
        // The models in front before these ended as they should: theirs is not a session that died.
        if (slot && !readOnlySlot) markSessionClosed(slot);
        slot = key;
        forgetRecoveryOffer();
        const plan = planAutosave(key);
        readOnlySlot = plan.tooNew;
        // No marker on a slot this session does not write: a crash here leaves nothing of ours to offer.
        if (!plan.tooNew) markSessionOpen(key);
        const current = useProjectStore.getState();
        const overlaps = current.models.some((m) => refs.some((r) => r.key === m.key));
        if (modelVersionSwapActive()) keepProjectForNewVersion(refs);
        else if (plan.restore) {
          loadProjectDocument(plan.restore.doc);
          void restoreModelState(key, () => slot);
          void restoreRasters(key);
        } else if (!overlaps) resetProject();
        // The last session on these models died with work no project file holds: the intro and the drawer offer it back.
        if (plan.recoverable) offerRecovery({ key, doc: plan.recoverable.doc, savedAt: plan.recoverable.savedAt, modelName: refs.map((r) => r.name).join(', ') });
        if (plan.tooNew) noticeAutosaveTooNew();
      }
      syncProjectWithModels(refs, storeys);
    };

    onModels();
    const unsubModels = useViewerStore.subscribe((state, prev) => {
      if (state.models !== prev.models || state.ifcDataStore !== prev.ifcDataStore || state.mutationVersion !== prev.mutationVersion) onModels();
    });
    const stopAutosave = watchProjectForAutosave(() => (readOnlySlot ? null : slot));
    // The page closing as a page does is a clean end; coming back from the back-forward cache reopens it.
    const closed = () => { if (slot && !readOnlySlot) markSessionClosed(slot); };
    const reopened = (e: PageTransitionEvent) => { if (e.persisted && slot && !readOnlySlot) markSessionOpen(slot); };
    window.addEventListener('pagehide', closed);
    window.addEventListener('pageshow', reopened);
    return () => {
      unsubModels();
      stopAutosave();
      window.removeEventListener('pagehide', closed);
      window.removeEventListener('pageshow', reopened);
      closed();
    };
  }, []);
}
