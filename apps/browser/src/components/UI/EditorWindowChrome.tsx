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
