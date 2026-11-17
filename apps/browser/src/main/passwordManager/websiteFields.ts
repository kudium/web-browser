import type { VaultField } from '../../browser/passwordManager';
import { isProtectedField } from '../../browser/passwordManager';
import type { PasswordVault } from './vault';

// Both explicit input saves and generated passwords belong to the same scoped website record.
export function saveWebsiteFields(vault: PasswordVault, expected: string, scope: string | undefined, incoming: VaultField[], confirmUpdate = false) {
  // Labels may be long, but credential values must never be truncated.
  if (incoming.some((field) => field.value.length > 4096))
    throw new Error('This input is too long to save. Use up to 4,096 characters.');
  incoming = incoming.map((field) => ({ ...field, name: field.name.slice(0, 120), aliases: field.aliases?.slice(0, 10).map((alias) => alias.slice(0, 120)) }));
  const url = new URL(expected);
  const account = incoming.find((field) => /^(username|email)$/i.test(field.name))?.value;
  const websiteRecords = vault.matching(expected, false, scope).filter((record) => record.origin === url.origin && (record.kind === 'knowledge' || record.kind === 'login'));
  const identity = (id: string) => {
    const record = vault.forFill(id, expected, false, scope);
    return record.kind === 'login' ? record.username : record.fields.find((field) =>
      [field.name, ...(field.aliases || [])].some((name) => /^(username|email)$/i.test(name)))?.value;
  };
  const existing = account
    ? websiteRecords.find((record) => identity(record.id) === account) || websiteRecords.find((record) => !identity(record.id))
    : websiteRecords.length === 1 ? websiteRecords[0] : websiteRecords.find((record) => !identity(record.id));
  if (!account && websiteRecords.length > 1 && !existing) throw new Error('Choose an account before saving website data.');
  const title = existing?.title && !existing.title.endsWith(' · Saved inputs') ? existing.title :
    account && websiteRecords.some((record) => identity(record.id) && identity(record.id) !== account) ? `${url.hostname} · ${account}` : url.hostname;
  const saved = existing ? vault.forFill(existing.id, expected, false, scope) : undefined;
  const fields = [...(saved?.fields || [])];
  if (saved?.kind === 'login') {
    if (!fields.some((field) => /^(username|email)$/i.test(field.name))) fields.push({ name: 'Username', value: saved.username, secret: false });
    if (!fields.some((field) => /^password$/i.test(field.name))) fields.push({ name: 'Password', value: saved.password, secret: true });
  }
  let needsUpdate = false;
  for (const entry of incoming) {
    const field = { ...entry, secret: isProtectedField(entry) };
    const index = fields.findIndex((current) => current.name.toLowerCase() === field.name.toLowerCase() ||
      (field.name === 'Username' && [current.name, ...(current.aliases || [])].some((name) => /^(username|email)$/i.test(name))) ||
      (field.name === 'Password' && isProtectedField(current) && [current.name, ...(current.aliases || [])].some((name) => /^(password|current-password|new-password)$/i.test(name))));
    if (index >= 0) {
      if (fields[index].value !== field.value || isProtectedField(fields[index]) !== field.secret) needsUpdate = true;
      fields[index] = field;
    } else fields.push(field);
  }
  if (needsUpdate && !confirmUpdate) return { needsUpdate: true, saved: false };
  vault.save({ ...(saved || { id: '', username: '', password: '', kind: 'knowledge' as const }), title: title.slice(0, 120), origin: url.origin, fields, ...(saved?.kind === 'login' ? { username: account || saved.username, password: fields.find((field) => /^password$/i.test(field.name))?.value || saved.password } : {}), allowAI: false }, scope);
  return { saved: true, updated: needsUpdate };
}
