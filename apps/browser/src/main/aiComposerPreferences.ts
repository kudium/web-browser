import fs from 'fs';
import type { AIAccessMode } from '../browser/aiPermissions';

/** Human-selected defaults only; task/tool grants never write this file. */
export class AIComposerPreferences {
  value: { accessMode: AIAccessMode; groupId: string | null } = {
    accessMode: 'standard',
    groupId: null,
  };

  constructor(private file: string) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (['ask', 'standard', 'full'].includes(saved.accessMode))
        this.value.accessMode = saved.accessMode;
      if (
        saved.groupId === null ||
        (typeof saved.groupId === 'string' && saved.groupId.length <= 512)
      )
        this.value.groupId = saved.groupId;
    } catch {
      /* First run or invalid preferences use safe defaults. */
    }
  }

  save(patch: Partial<typeof this.value>) {
    const value = { ...this.value, ...patch };
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(value), {
      mode: 0o600,
    });
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.value = value;
  }
}
