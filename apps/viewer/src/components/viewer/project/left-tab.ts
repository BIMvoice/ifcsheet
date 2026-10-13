/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type LeftTab = 'model' | 'project';

/** The tab to open on: Project, unless the person last chose Model. */
export function leftTabFrom(stored: string | null): LeftTab {
  return stored === 'model' ? 'model' : 'project';
}
