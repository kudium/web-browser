import type { IApp } from '../types';
import { aiGroupId } from '../browser/aiGroups';
import {
  diffWorkspaceManifest,
  workspaceDiffEmpty,
} from '../browser/workspaceManifest';
import { linkedProjectFolder, onProjectChanged } from './developerProject';
import { onProjectScriptsChanged } from './projectScripts';
import { onSiteSettingsChanged } from './siteSettings';
import {
  getBrowserPreferences,
  onBrowserPreferencesChanged,
} from './preferences';
import {
  onWorkspaceManifestWritten,
  readWorkspaceManifest,
  serializeWorkspaceManifest,
  writeWorkspaceManifest,
} from './workspaceManifest';
import { workspaceFromBrowser } from './workspaceBrowserState';
import {
  projectTerminalDefinitions,
  onProjectTerminalsChanged,
} from './projectTerminal';

/** One writer for the shared browser model, driven by mutations rather than polling. */
export class ProjectWorkspaceSync {
  private fingerprints = new Map<string, string>();
  private baselines = new Map<
    string,
    { folder: string; contents: string; needsReview?: boolean }
  >();
  private dirty = new Set<string>();
  private paused = new Map<string, number>();
  private accepted = new Set<string>();
  private notices = new Map<string, string>();
  private timer?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private off: (() => void)[];

  constructor(private tabs: () => IApp[]) {
    this.off = [
      onProjectChanged((key) => {
        this.baselines.delete(key);
        this.accepted.add(key);
        this.mark(key);
      }),
      onProjectScriptsChanged(() => this.markAll()),
      onSiteSettingsChanged(() => this.markAll()),
      onProjectTerminalsChanged((key) => this.mark(key)),
      onBrowserPreferencesChanged(() => this.markAll()),
      onWorkspaceManifestWritten((folder, manifest) => {
        for (const [key, baseline] of this.baselines)
          if (baseline.folder === folder)
            this.baselines.set(key, {
              folder,
              contents: serializeWorkspaceManifest(manifest),
            });
      }),
    ];
  }

  onNotice(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notice(key: string) {
    return this.notices.get(key);
  }

  suspend(key: string) {
    this.paused.set(key, (this.paused.get(key) || 0) + 1);
    return () => {
      const count = (this.paused.get(key) || 1) - 1;
      if (count) this.paused.set(key, count);
      else this.paused.delete(key);
      this.schedule();
    };
  }

  refresh() {
    const groups = new Map<string, IApp[]>();
    this.tabs()
      .filter((tab) => !tab.archived)
      .forEach((tab) => {
        const key = aiGroupId(tab);
        let members = groups.get(key);
        if (!members) {
          members = [];
          groups.set(key, members);
        }
        members.push(tab);
      });
    for (const [key, members] of groups) {
      const next = JSON.stringify(
        members.map((tab) => [
          tab.id,
          tab.url,
          tab.name,
          tab.customName,
          tab.sessionName,
          tab.sessionSlug,
          tab.groupDisplay,
          tab.sessionMode,
          tab.tabPinned,
          tab.aiTrusted,
        ])
      );
      if (this.fingerprints.get(key) === next) continue;
      this.fingerprints.set(key, next);
      this.mark(key);
    }
    for (const key of this.fingerprints.keys())
      if (!groups.has(key)) {
        this.fingerprints.delete(key);
        this.baselines.delete(key);
        this.dirty.delete(key);
      }
  }

  private markAll() {
    for (const key of this.fingerprints.keys()) this.mark(key);
  }
  private mark(key: string) {
    this.dirty.add(key);
    this.schedule();
  }
  private schedule() {
    if (this.timer || ![...this.dirty].some((key) => !this.paused.has(key)))
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, 500);
    this.timer.unref?.();
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!getBrowserPreferences().writeBrowserInstructions) return;
    const tabs = this.tabs().filter((tab) => !tab.archived);
    for (const key of [...this.dirty]) {
      if (this.paused.has(key) || !tabs.some((tab) => aiGroupId(tab) === key))
        continue;
      this.dirty.delete(key);
      try {
        const folder = linkedProjectFolder(key);
        if (!folder) {
          this.baselines.delete(key);
          continue;
        }
        const file = readWorkspaceManifest(folder);
        const contents = file ? serializeWorkspaceManifest(file) : '';
        const baseline = this.baselines.get(key);
        const accepted = this.accepted.delete(key);
        if (!baseline || baseline.folder !== folder) {
          const needsReview =
            !!file &&
            !accepted &&
            !workspaceDiffEmpty(
              diffWorkspaceManifest(
                workspaceFromBrowser(tabs, key, folder, file),
                file
              )
            );
          this.baselines.set(key, { folder, contents, needsReview });
          if (needsReview)
            throw new Error(
              'The saved project setup differs from this browser. Link the folder again to review it before saving browser changes.'
            );
          // Opening a browser must not replace a team's existing project setup.
          if (file && !accepted) continue;
        } else if (baseline.needsReview || baseline.contents !== contents) {
          throw new Error(
            'The configuration changed outside Kudium. Link the folder again to review it before saving browser changes.'
          );
        }
        const manifest = workspaceFromBrowser(tabs, key, folder, file);
        const terminals = projectTerminalDefinitions(key);
        if (terminals !== undefined) manifest.terminals = terminals;
        writeWorkspaceManifest(folder, manifest);
        this.baselines.set(key, {
          folder,
          contents: serializeWorkspaceManifest(manifest),
        });
        if (this.notices.delete(key))
          this.listeners.forEach((listener) => listener());
      } catch (error) {
        const notice = `Could not save kudium.workspace.json: ${(error as Error).message}`;
        if (this.notices.get(key) !== notice) {
          this.notices.set(key, notice);
          this.listeners.forEach((listener) => listener());
        }
      }
    }
  }

  dispose() {
    this.flush();
    if (this.timer) clearTimeout(this.timer);
    this.off.forEach((off) => off());
    this.listeners.clear();
  }
}
