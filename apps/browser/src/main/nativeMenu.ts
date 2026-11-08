import type { NativeMenuItem } from '../browser/nativeUi';

/** Validate and copy the full renderer menu before opening any native UI. */
export function parseNativeMenu(value: unknown): NativeMenuItem[] {
  let count = 0;
  const ids = new Set<string>();
  const parse = (entries: unknown, depth = 0): NativeMenuItem[] => {
    if (!Array.isArray(entries) || depth > 5) throw new Error('Invalid menu');
    if (entries.length > 200 - count) throw new Error('Menu is too large');
    return Array.from(entries, (entry: unknown) => {
      count += 1;
      if (count > 200) throw new Error('Menu is too large');
      if (!entry || typeof entry !== 'object' || Array.isArray(entry))
        throw new Error('Invalid menu item');
      const item = entry as NativeMenuItem;
      if (
        item.type !== undefined &&
        !['normal', 'separator'].includes(item.type)
      )
        throw new Error('Invalid menu type');
      if (item.enabled !== undefined && typeof item.enabled !== 'boolean')
        throw new Error('Invalid menu state');
      if (item.type === 'separator') {
        if (item.id !== undefined || item.submenu !== undefined)
          throw new Error('Invalid separator');
        return { type: 'separator' };
      }
      if (typeof item.label !== 'string' || item.label.length > 200)
        throw new Error('Invalid menu label');
      if (item.id !== undefined) {
        if (
          typeof item.id !== 'string' ||
          !item.id ||
          item.id.length > 1024 ||
          ids.has(item.id)
        )
          throw new Error('Invalid or duplicate menu ID');
        ids.add(item.id);
      }
      return {
        label: item.label,
        enabled: item.enabled !== false,
        ...(item.id === undefined ? {} : { id: item.id }),
        ...(item.submenu === undefined
          ? {}
          : { submenu: parse(item.submenu, depth + 1) }),
      };
    });
  };
  return parse(value);
}
