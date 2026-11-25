import { DropdownMenu, IconButton } from '@radix-ui/themes';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
/* eslint-disable react/require-default-props */
export function EditorWindowHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="site-developer-page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle}
      </div>
      {children}
    </header>
  );
}
export function EditorWindowFooter({
  status,
  children,
}: {
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <footer className="site-settings-footer site-developer-footer">
      <span role="status">{status}</span>
      {children}
    </footer>
  );
}

export function HookFooterOptions({ children }: { children: ReactNode }) {
  return <DropdownMenu.Root><DropdownMenu.Trigger>
    <IconButton size="2" variant="soft" color="gray" aria-label="Hook footer options" title="More options"><MoreHorizontal size={16} /></IconButton>
  </DropdownMenu.Trigger><DropdownMenu.Content align="end">{children}</DropdownMenu.Content></DropdownMenu.Root>;
}
