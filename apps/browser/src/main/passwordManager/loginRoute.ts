/** Route hints cannot widen a credential's authorized website. Strip transient URL data. */
export function preferredLoginURL(value: string, origin: string): string {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.origin !== new URL(origin).origin ||
    url.username ||
    url.password
  )
    throw new Error('The login page must belong to the saved HTTPS website.');
  url.search = '';
  url.hash = '';
  return url.href;
}
