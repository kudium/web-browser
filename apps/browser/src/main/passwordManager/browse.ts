import { isProtectedField } from '../../browser/passwordManager';
import type { PasswordVault } from './vault';

/** Explicit browsing may cross website origins, but never group boundaries or secrets. */
export function browseSavedData(vault: PasswordVault, scope?: string) {
  if (!vault.status().enabled || !vault.status().autofill) throw new Error('Personal Data is disabled.');
  return vault.records(scope)
    .filter((item) => ['profile', 'knowledge', 'login'].includes(item.kind))
    .sort((a, b) => Number(!!b.scope) - Number(!!a.scope))
    .flatMap((item) => {
      const fields = item.fields.filter((field) => field.value && !isProtectedField(field));
      if (item.kind === 'login' && item.username && !fields.some((field) => /^(username|email)$/i.test(field.name)))
        fields.unshift({ name: 'Username', value: item.username, secret: false });
      return fields.length ? [{ id: item.id, title: item.title, kind: item.kind, sourceLabel: item.scope ? 'Group data' : 'Browser data', fields }] : [];
    }).slice(0, 100);
}
