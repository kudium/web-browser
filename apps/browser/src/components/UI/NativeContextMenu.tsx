/* Declarative parts are consumed by the menu compiler, rather than rendered. */
/* eslint-disable react/require-default-props, react/no-unused-prop-types */
import {
  Children,
  createContext,
  isValidElement,
  ReactNode,
  useContext,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { browser } from '../../browser/client';
import { NativeMenuItem } from '../../browser/nativeUi';

const MenuContext = createContext<(() => void) | null>(null);

interface PartProps {
  children?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  color?: string;
}
// Declarative menu parts are metadata. Electron renders the actual OS menu.
function Item(_props: PartProps) {
  return null;
}
function Separator() {
  return null;
}
function Label(_props: PartProps) {
  return null;
}
function Content(_props: PartProps) {
  return null;
}
function Sub(_props: PartProps) {
  return null;
}
function SubTrigger(_props: PartProps) {
  return null;
}
function Trigger({ children }: PartProps) {
  // A fragment preserves arbitrary trigger children without an extra DOM box.
  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{children}</>;
}
function text(nodes: ReactNode): string {
  return Children.toArray(nodes)
    .map((node) => {
      if (typeof node === 'string' || typeof node === 'number')
        return String(node);
      if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
      return '';
    })
    .join('');
}

function OptionsTrigger({ children }: PartProps) {
  const show = useContext(MenuContext);
  return (
    <button
      type="button"
      className="folder-options"
      aria-label={text(children)}
      aria-haspopup="menu"
      onClick={(event) => {
        event.stopPropagation();
        show?.();
      }}
    >
      {children}
    </button>
  );
}

export async function showNativeContextMenu(
  children: ReactNode,
  active: () => boolean = () => true
) {
  const callbacks = new Map<string, () => void>();
  let nextId = 0;
  const parse = (nodes: ReactNode): NativeMenuItem[] =>
    Children.toArray(nodes).flatMap((node) => {
      if (!isValidElement<PartProps>(node)) return [];
      if (node.type === Item) {
        const id = String(nextId);
        nextId += 1;
        if (node.props.onSelect) callbacks.set(id, node.props.onSelect);
        return [
          {
            id,
            label: text(node.props.children).slice(0, 200),
            enabled: !node.props.disabled,
          },
        ];
      }
      if (node.type === Separator) return [{ type: 'separator' as const }];
      if (node.type === Label)
        return [
          { label: text(node.props.children).slice(0, 200), enabled: false },
        ];
      if (node.type === Sub) {
        const parts = Children.toArray(node.props.children).filter(
          (part): part is import('react').ReactElement<PartProps> =>
            isValidElement(part)
        );
        const label = parts.find((part) => part.type === SubTrigger);
        const submenu = parse(parts.filter((part) => part.type !== SubTrigger));
        return [
          {
            enabled: submenu.length > 0,
            label: text(label?.props.children).slice(0, 200),
            submenu,
          },
        ];
      }
      if (
        node.type === Trigger ||
        node.type === OptionsTrigger ||
        node.type === SubTrigger
      )
        return [];
      return parse(node.props.children);
    });
  const selected = await browser.nativeMenu(parse(children));
  if (selected !== null && active()) callbacks.get(selected)?.();
}

function Root({
  children,
  menu,
}: {
  children: ReactNode;
  menu?: () => ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const show = useCallback(
    () => showNativeContextMenu(menu ? menu() : children, () => mounted.current),
    [children, menu]
  );
  const openMenu = useCallback(() => {
    show().catch(() => {});
  }, [show]);
  // Events bubble from the keyboard-focusable trigger through this layout-free wrapper.
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      style={{ display: 'contents' }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        show().catch(() => {});
      }}
      onKeyDown={(event) => {
        if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault();
          show().catch(() => {});
        }
      }}
    >
      <MenuContext.Provider value={openMenu}>{children}</MenuContext.Provider>
    </div>
  );
}
export const NativeContextMenu = {
  Root,
  Trigger,
  OptionsTrigger,
  Content,
  Item,
  Separator,
  Label,
  Sub,
  SubTrigger,
  SubContent: Content,
};
