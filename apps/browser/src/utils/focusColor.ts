import type { CSSProperties } from 'react';
import type { IApp } from '../types';
import { primaryContrast } from './appTheme';

/** Only opaque hex colors can become item backgrounds or selection highlights. */
export function normalizeFocusColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : undefined;
}
/** A group's color and an individual tab's color never inherit from each other. */
export function itemFocusColor(
  item: Pick<IApp, 'focusColor' | 'sessionFocusColor'>,
  kind: 'group' | 'tab' = 'group'
) {
  return normalizeFocusColor(
    kind === 'tab' ? item.focusColor : item.sessionFocusColor
  );
}
export function focusColorStyle(value: unknown): CSSProperties | undefined {
  const color = normalizeFocusColor(value);
  return color
    ? ({
        '--item-focus-color': color,
        '--item-focus-contrast': primaryContrast(color),
      } as CSSProperties)
    : undefined;
}
