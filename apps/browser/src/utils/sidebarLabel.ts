/** Clean up automatic address labels without changing saved names or URLs. */
export function sidebarLabel(name: string): string {
  if (name === 'about:blank') return 'New tab';
  try {
    const address = new URL(name);
    if (
      ['http:', 'https:'].includes(address.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)
    )
      return 'Local project';
  } catch {
    // Named groups and page titles are already suitable labels.
  }
  return name;
}
