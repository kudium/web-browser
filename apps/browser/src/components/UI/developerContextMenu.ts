import type { NativeMenuItem } from '../../browser/nativeUi';
import { browser } from '../../browser/client';
import { projectErrorMessage } from '../../browser/developerProject';

export interface DeveloperMenuItem {
  label?: string;
  disabled?: boolean;
  separator?: boolean;
  submenu?: DeveloperMenuItem[];
  run?: () => void | Promise<unknown>;
}
export const menuSeparator: DeveloperMenuItem = { separator: true };
export async function showDeveloperContextMenu(
  items: DeveloperMenuItem[],
  active: () => boolean,
  onError: (message: string) => void
) {
  try {
    const actions = new Map<string, DeveloperMenuItem>();
    const compile = (
      entries: DeveloperMenuItem[],
      prefix = ''
    ): NativeMenuItem[] =>
      entries.map((item, index) => {
        const id = `${prefix}${index}`;
        actions.set(id, item);
        return item.separator
          ? { type: 'separator' }
          : {
              id,
              label: item.label?.slice(0, 200),
              enabled: !item.disabled,
              ...(item.submenu
                ? { submenu: compile(item.submenu, `${id}.`) }
                : {}),
            };
      });
    const selected = await browser.nativeMenu(compile(items));
    if (selected !== null && active()) {
      const item = actions.get(selected);
      if (item && !item.disabled) await item.run?.();
    }
  } catch (error) {
    if (active()) onError(projectErrorMessage(error));
  }
}
