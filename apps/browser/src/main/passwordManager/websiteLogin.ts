import type { PasswordVault } from './vault';
import type { VaultField } from '../../browser/passwordManager';

/** Compare within the vault without exposing any saved credentials to the page. */
export function hasSavedWebsiteLogin(vault: PasswordVault, url: string, scope: string | undefined, username: string, password: string): boolean {
  const origin = new URL(url).origin;
  const matches = (field: VaultField, pattern: RegExp, value: string) =>
    field.value === value && [field.name, ...(field.aliases || [])].some((name) => pattern.test(name));
  return vault.matching(url, false, scope).filter((record) => record.origin === origin).some((record) => {
    const saved = vault.forFill(record.id, url, false, scope);
    if (saved.kind === 'login' && saved.username === username && saved.password === password) return true;
    return saved.fields.some((field) => matches(field, /^(username|email)$/i, username)) &&
      saved.fields.some((field) => matches(field, /^(password|current-password|new-password)$/i, password));
  });
}
