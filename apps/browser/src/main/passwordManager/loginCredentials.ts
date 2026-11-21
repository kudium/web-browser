import type { VaultItem } from '../../browser/passwordManager';

export function loginCredentials(item: VaultItem) {
  if (item.kind === 'login' && item.username && item.password)
    return { username: item.username, password: item.password };
  if (!['knowledge', 'login'].includes(item.kind)) return undefined;
  const users = item.fields.filter(
    (field) =>
      !field.secret &&
      [field.name, ...(field.aliases || [])].some((name) =>
        /^(username|email)$/i.test(name),
      ),
  );
  const passwords = item.fields.filter(
    (field) =>
      field.secret &&
      [field.name, ...(field.aliases || [])].some((name) =>
        /^(password|current-password)$/i.test(name),
      ),
  );
  return users.length === 1 &&
    passwords.length === 1 &&
    users[0].value &&
    passwords[0].value
    ? { username: users[0].value, password: passwords[0].value }
    : undefined;
}
