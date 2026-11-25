/* eslint-disable react/jsx-props-no-spreading, react/require-default-props */
import { HTMLAttributes, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from '@radix-ui/themes';
import { PanelDropdownContent } from './PanelDialog';
import { TabIcon, type TabAppearance } from './TabIcon';
import { ChromeIconButton } from './ChromeIconButton';


export function HorizontalTabList({
  mode,
  tabs,
  onSelect,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  mode: 'dropdown' | 'scroll';
  tabs: Array<{ id: string; title: string; icon?: string } & TabAppearance>;
  onSelect: (id: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return undefined;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const nodes = element.querySelectorAll<HTMLElement>('.horizontal-tab');
      const rects = Array.from(nodes, (node) => node.getBoundingClientRect());
      element.dataset.fadeLeft = String(mode === 'scroll' && rects.some(rect => rect.left < bounds.left - 1));
      element.dataset.fadeRight = String(mode === 'scroll' && rects.some(rect => rect.right > bounds.right + 1));
      const hidden = tabs
        .filter((tab, index) => {
          const rect = rects[index];
          return (
            rect &&
            (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)
          );
        })
        .map((tab) => tab.id);
      setOverflowIds((previous) =>
        previous.join('\0') === hidden.join('\0') ? previous : hidden
      );
    };
    measure();
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    element
      .querySelectorAll('.horizontal-tab')
      .forEach((tab) => observer.observe(tab));
    element.addEventListener('scroll', schedule);
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tabs, mode]);
  return (
    <>
      <div {...props} ref={list} data-overflow={mode}>
        {children}
      </div>
      {mode === 'dropdown' && overflowIds.length > 0 && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <ChromeIconButton icon={ChevronDown} label="Show overflow tabs" />
          </DropdownMenu.Trigger>
          <PanelDropdownContent
            className="tab-overflow-menu"
            align="end"
            sideOffset={4}
            collisionPadding={12}
            aria-label="Overflow tabs"
          >
            {tabs
              .filter((tab) => overflowIds.includes(tab.id))
              .map((tab) => (
                <DropdownMenu.Item
                  key={tab.id}
                  className="tab-overflow-item"
                  onSelect={() => onSelect(tab.id)}
                  textValue={tab.title}
                >
                  <TabIcon tab={{ ...tab, icon: tab.icon || '', name: tab.title }} />
                  <span className="tab-overflow-title" title={tab.title}>
                    {tab.title}
                  </span>
                </DropdownMenu.Item>
              ))}
          </PanelDropdownContent>
        </DropdownMenu.Root>
      )}
    </>
  );
}
