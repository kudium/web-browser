import type { SyncedLogin } from '../sync/passwords';

/** Browser CSV exports allow quoted commas, quotes and multiline passwords. */
export function parseBrowserPasswords(text: string) {
  if (Buffer.byteLength(text) > 8 * 1024 * 1024)
    throw new Error('Choose a password export smaller than 8 MB.');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (!quoted && field) throw new Error('Invalid password CSV.');
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
      if (rows.length > 1001)
        throw new Error('Import up to 1,000 passwords at a time.');
    } else field += char;
  }
  if (quoted) throw new Error('Invalid password CSV.');
  row.push(field);
  if (row.some(Boolean)) rows.push(row);
  if (rows.length > 1001)
    throw new Error('Import up to 1,000 passwords at a time.');
  const headers = (rows.shift() || []).map((value) =>
    value
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
  );
  const index = (names: string[]) =>
    headers.findIndex((name) => names.includes(name));
  const urlIndex = index(['url', 'website', 'login_uri']);
  const userIndex = index(['username', 'user name', 'login_username']);
  const passIndex = index(['password', 'login_password']);
  const nameIndex = index(['name', 'title']);
  if ([urlIndex, userIndex, passIndex].some((value) => value < 0))
    throw new Error(
      'Choose a browser CSV with URL, username and password columns.'
    );
  const items: SyncedLogin[] = [];
  let skipped = 0;
  rows.forEach((values) => {
    try {
      const url = new URL(values[urlIndex]);
      const username = values[userIndex] || '';
      const password = values[passIndex] || '';
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        !password ||
        username.length > 1000 ||
        password.length > 4096 ||
        url.origin.length > 4096
      )
        throw new Error();
      items.push({
        title: (values[nameIndex] || url.hostname).slice(0, 120),
        origin: url.origin,
        username,
        password,
      });
    } catch {
      skipped += 1;
    }
  });
  if (!items.length)
    throw new Error(
      'No supported website passwords found. Only HTTPS logins can be imported.'
    );
  return { items, skipped };
}
