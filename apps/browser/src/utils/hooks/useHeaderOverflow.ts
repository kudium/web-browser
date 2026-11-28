import { useLayoutEffect, useRef, type RefObject } from 'react';
import { browser } from '../../browser/client';
import type { NativeMenuItem } from '../../browser/nativeUi';

const label = (element: HTMLElement) =>
  element.getAttribute('aria-label') ||
  element.getAttribute('title') ||
  element.textContent?.trim() ||
  '';

/** Measure only this header; retain original controls and invoke their existing actions. */
export function useHeaderOverflow(
  header: RefObject<HTMLDivElement | null>,
  more: RefObject<HTMLButtonElement | null>,
) {
  const overflow = useRef<HTMLElement[]>([]);
  useLayoutEffect(() => {
    const root = header.current,
      trigger = more.current;
    if (!root || !trigger) return undefined;
    const owner = root.ownerDocument.defaultView || window;
    let frame = 0;
    const fits = () => {
      if (root.scrollWidth > root.clientWidth + 1) return false;
      const bounds = root.getBoundingClientRect();
      const controls = [
        ...root.querySelectorAll<HTMLElement>(
          'button, .panel-dock-button, .assistant-page-title, h2',
        ),
      ]
        .filter((element) => element.getClientRects().length)
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0)
        .sort((left, right) => left.left - right.left);
      // Flex children can overlap their neighbors without increasing scrollWidth.
      return controls.every(
        (rect, index) =>
          rect.left >= bounds.left - 1 &&
          rect.right <= bounds.right + 1 &&
          (index === 0 || rect.left >= controls[index - 1].right - 1),
      );
    };
    const fit = () => {
      frame = 0;
      for (const element of overflow.current) {
        element.hidden = false;
        delete element.dataset.headerOverflow;
      }
      overflow.current = [];
      trigger.hidden = true;
      delete root.dataset.headerCompact;
      if (root.clientWidth <= 0) return;
      // Picker and popup triggers stay in the header so their anchors remain valid.
      const controls = [
        ...root.querySelectorAll<HTMLElement>('button, .panel-dock-button'),
      ].filter(
        (element) =>
          element !== trigger &&
          !element.hidden &&
          !element.hasAttribute('data-header-essential') &&
          !element.closest('.group-picker-trigger') &&
          !element.hasAttribute('aria-haspopup') &&
          !element.closest('.panel-dock-button select') &&
          !!label(
            element.classList.contains('panel-dock-button')
              ? element.querySelector('select') || element
              : element,
          ),
      );
      if (fits()) return;
      trigger.hidden = false;
      root.dataset.headerCompact = 'true';
      for (const element of controls.reverse()) {
        if (fits()) break;
        element.hidden = true;
        element.dataset.headerOverflow = 'true';
        overflow.current.unshift(element);
        if (element.contains(root.ownerDocument.activeElement))
          trigger.focus({ preventScroll: true });
      }
      if (!overflow.current.length) trigger.hidden = true;
    };
    const schedule = () => {
      if (!frame) frame = owner.requestAnimationFrame(fit);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-label', 'aria-pressed'],
    });
    fit();
    return () => {
      resize.disconnect();
      mutations.disconnect();
      owner.cancelAnimationFrame(frame);
      for (const element of overflow.current) {
        element.hidden = false;
        delete element.dataset.headerOverflow;
      }
      overflow.current = [];
    };
  }, [header, more]);

  return async () => {
    const root = header.current;
    if (!root?.isConnected || root.closest('[hidden]')) return;
    const actions = new Map<string, () => void>();
    const items: NativeMenuItem[] = overflow.current
      .filter((element) => root.contains(element))
      .map((element, index) => {
        const select = element.querySelector<HTMLSelectElement>('select');
        if (select)
          return {
            label: label(select),
            submenu: [...select.options].map((option, optionIndex) => {
              const id = `${index}-${optionIndex}`;
              actions.set(id, () => {
                if (
                  !root.contains(select) ||
                  select.disabled ||
                  option.disabled ||
                  !select.contains(option)
                )
                  return;
                select.value = option.value;
                select.dispatchEvent(
                  new (select.ownerDocument.defaultView || window).Event(
                    'change',
                    { bubbles: true },
                  ),
                );
              });
              return {
                id,
                label: option.label,
                type: 'checkbox',
                checked: select.value === option.value,
                enabled: !select.disabled && !option.disabled,
              };
            }),
          };
        const button = element as HTMLButtonElement,
          id = String(index);
        actions.set(id, () => {
          if (root.contains(button) && !button.disabled) button.click();
        });
        return {
          id,
          label: label(button),
          enabled: !button.disabled,
          ...(button.hasAttribute('aria-pressed') && {
            type: 'checkbox' as const,
            checked: button.getAttribute('aria-pressed') === 'true',
          }),
        };
      });
    // Build native menu metadata only on request; no action work runs while opening it.
    try {
      const choice = await browser.nativeMenu(items);
      if (
        choice !== null &&
        header.current === root &&
        root.isConnected &&
        !root.closest('[hidden]')
      )
        actions.get(choice)?.();
    } catch {
      /* A dismissed or unavailable native menu leaves the header unchanged. */
    }
  };
}
