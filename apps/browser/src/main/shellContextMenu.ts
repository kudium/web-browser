import { clipboard } from 'electron';
import { openWindowLink } from './windowNavigation';
import type {
  ContextMenuParams,
  MenuItemConstructorOptions,
  WebContents,
} from 'electron';
import { nativeMenuLabels } from '../browser/menuLabels';

/**
 * Native edit actions target the clicked UI field, never a browser page behind
 * it.
 */
export function shellContextMenu(
  contents: WebContents,
  params: ContextMenuParams,
  inspect: boolean
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const group = (entries: MenuItemConstructorOptions[]) => {
    if (!entries.length) return;
    if (items.length) items.push({ type: 'separator' });
    items.push(...entries);
  };
  if (params.isEditable) {
    group(
      (params.dictionarySuggestions || []).slice(0, 5).map((word) => ({
        label: word,
        click: () => contents.replaceMisspelling(word),
      }))
    );
    group([
      { role: 'undo', enabled: params.editFlags.canUndo },
      { role: 'redo', enabled: params.editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ]);
  } else if (params.selectionText)
    group([{ role: 'copy' }, { role: 'selectAll' }]);
  if (/^(https?:|mailto:)/i.test(params.linkURL))
    group([
      {
        label: 'Open link',
        click: () => {
          openWindowLink(contents, params.linkURL);
        },
      },
      {
        label: 'Copy link',
        click: () => {
          clipboard.writeText(params.linkURL);
        },
      },
    ]);
  if (params.mediaType === 'image')
    group([
      {
        label: 'Copy image',
        click: () => contents.copyImageAt(params.x, params.y),
      },
    ]);
  if (inspect)
    group([
      {
        label: nativeMenuLabels.inspectElement,
        click: () => contents.inspectElement(params.x, params.y),
      },
    ]);
  return items;
}
