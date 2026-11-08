import { browser } from '../../browser/client';
import { projectErrorMessage } from '../../browser/developerProject';

export interface DeveloperMenuItem {
  label?: string;
  disabled?: boolean;
  separator?: boolean;
  run?: () => void | Promise<unknown>;
}
export const menuSeparator: DeveloperMenuItem = { separator: true };
export async function showDeveloperContextMenu(
  items: DeveloperMenuItem[],
  active: () => boolean,
  onError: (message: string) => void
) {
  try {
    const selected = await browser.nativeMenu(
      items.map((item, index) =>
        item.separator
          ? { type: 'separator' as const }
          : {
              id: String(index),
              label: item.label?.slice(0, 200),
              enabled: !item.disabled,
            }
      )
    );
    if (selected !== null && active()) {
      const item = items[Number(selected)];
      if (item && !item.disabled) await item.run?.();
    }
  } catch (error) {
    if (active()) onError(projectErrorMessage(error));
  }
}
