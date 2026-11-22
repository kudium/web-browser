import { isProtectedField } from '../../browser/passwordManager';
import type { VaultItem } from '../../browser/passwordManager';

export function loginCredentials(item: VaultItem) {
  if (item.kind === 'login' && item.username && item.password)
    return { username: item.username, password: item.password };
  if (!['knowledge', 'login'].includes(item.kind)) return undefined;
  const users = item.fields.filter(
    (field) =>
      !isProtectedField(field) &&
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

/** AI-enabled ordinary values support selection; protected values stay local. */
export function autofillReferences(items: VaultItem[]) {
  return items.filter((item) => item.allowAI && ['profile', 'knowledge', 'login', 'payment'].includes(item.kind))
    .map((item) => ({
      recordId: item.id, title: item.title, origin: item.origin, kind: item.kind,
      fields: [
        ...(item.kind === 'login' ? [{ name: 'username', secret: false, value: item.username }, { name: 'current-password', secret: true }] : []),
        ...item.fields.map((field) => ({
          name: field.name, aliases: field.aliases || [], secret: isProtectedField(field),
          ...(!isProtectedField(field) ? { value: field.value } : {}),
        })),
      ],
    }));
}

export function savedLoginReferences(items: VaultItem[]) {
  return items.filter((item) => item.allowAI).flatMap((item) => {
    const credentials = loginCredentials(item);
    return item.origin && credentials
      ? [{ accountId: item.id, title: item.title, origin: item.origin, username: credentials.username, fields: ['username', 'current-password'] }]
      : [];
  });
}
