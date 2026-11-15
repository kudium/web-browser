import { personalDataMatching } from './personalDataMatching';

export interface VaultField {
  name: string;
  value: string;
  secret: boolean;
  aliases?: string[];
}
export interface VaultItem {
  id: string;
  title: string;
  origin: string;
  kind: 'login' | 'profile' | 'payment' | 'knowledge' | 'note';
  version?: 2;
  sensitive?: boolean;
  asRead?: boolean;
  scope?: string;
  source?: { label: string; url?: string; capturedAt: string };
  notes?: string;
  document?: { name: string; mime: string; content: string; text: string };
  inherited?: boolean;
  overridden?: boolean;
  username: string;
  password: string;
  fields: VaultField[];
  allowAI: boolean;
}
export type VaultSummary = Omit<
  VaultItem,
  'password' | 'fields' | 'notes' | 'document'
> & {
  fieldCount: number;
  preview?: string;
  privateCount?: number;
};
export interface VaultStatus {
  initialized: boolean;
  metadataReady?: boolean;
  authentication?: 'os' | 'master';
  canUseOS?: boolean;
  locked: boolean;
  enabled: boolean;
  autofill: boolean;
  ai: boolean;
  items: VaultSummary[];
  hidden?: VaultSummary[];
}
type VaultOperation =
  | { action: 'notes' }
  | { action: 'moveNote'; id: string; destination?: string }
  | { action: 'status' | 'lock' | 'authenticate' | 'createOS' }
  | { action: 'migrateOS'; password: string }
  | { action: 'unlock' | 'create'; password: string }
  | { action: 'settings'; enabled: boolean; autofill: boolean; ai: boolean }
  | { action: 'save'; item: VaultItem; destination?: string | null }
  | { action: 'delete' | 'edit' | 'reveal'; id: string }
  | { action: 'changePassword'; password: string }
  | { action: 'fill'; id: string; pageId: number }
  | { action: 'pages' }
  | { action: 'import'; allowAI: boolean }
  | { action: 'importPasswords' }
  | { action: 'hide' | 'reset'; id: string }
  | { action: 'removeScope'; disposition: 'delete' | 'move' | 'ask' };
export type VaultRequest = VaultOperation & { scope?: string };

/** Only differences from an inherited global record are persisted. */
export interface DataOverride {
  scope: string;
  recordId: string;
  hidden?: boolean;
  patch: Partial<
    Pick<
      VaultItem,
      'title' | 'origin' | 'username' | 'password' | 'notes' | 'allowAI'
    >
  >;
  fields?: VaultField[];
  removedFields?: string[];
}
export interface PersonalMatch {
  id: string;
  title: string;
  kind: VaultItem['kind'];
  source: string;
  excerpt: string;
}

export function recordSource(
  item: Pick<VaultItem, 'scope' | 'overridden' | 'inherited'>
) {
  if (item.scope) return 'Local to group';
  if (item.overridden) return 'Customized for group';
  if (item.inherited) return 'Inherited from browser';
  return 'Browser-wide';
}

export function inferredFieldAliases(name: string): string[] {
  return personalDataMatching.aliases(name);
}

export function isProtectedField(field: VaultField) {
  return (
    field.secret === true ||
    /https:\/\/api\.telegram\.org\/bot[^/]+\//i.test(field.value) ||
    /password|passwd|token|webhook|api.?key|secret.?key|otp|one-time|cvc|cvv|cc-|card.?number|security.?code/i.test(
      [
        field.name,
        ...(field.aliases || []),
        ...inferredFieldAliases(field.name),
      ].join(' ')
    )
  );
}

/** Adapt legacy login storage to the same key/value editor without copying it. */
export function entryForEditor(item: VaultItem): VaultItem {
  if (item.kind !== 'login') return { ...item, allowAI: item.allowAI === true };
  return {
    ...item,
    allowAI: item.allowAI === true,
    fields: [
      { name: 'username', value: item.username, secret: false },
      { name: 'password', value: item.password, secret: true },
      ...item.fields.filter(
        (field) => !['username', 'password'].includes(field.name.toLowerCase())
      ),
    ],
  };
}
export function entryForSave(item: VaultItem): VaultItem {
  const origin = item.origin.trim();
  const next = {
    ...item,
    title:
      item.title.trim() ||
      item.fields.find((field) => field.name.trim())?.name.trim() ||
      'Saved information',
    fields: item.fields.filter(
      (field) => field.name.trim() || field.value.trim()
    ),
    origin: origin && !origin.includes('://') ? `https://${origin}` : origin,
    allowAI: item.allowAI === true,
  };
  if (item.kind !== 'login') return next;
  return {
    ...next,
    username:
      item.fields.find((field) => field.name.toLowerCase() === 'username')
        ?.value || '',
    password:
      item.fields.find((field) => field.name.toLowerCase() === 'password')
        ?.value || '',
    fields: item.fields.filter(
      (field) => !['username', 'password'].includes(field.name.toLowerCase())
    ),
  };
}

export function generatePassword(random: Pick<Crypto, 'getRandomValues'>) {
  const bytes = random.getRandomValues(new Uint8Array(18));
  return `Aa1!${Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}
