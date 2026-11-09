import { recordSource, isProtectedField } from '../../browser/passwordManager';
import type {
  VaultItem,
  VaultSummary,
  DataOverride,
  PersonalMatch,
} from '../../browser/passwordManager';

export function summaryOf(item: VaultItem): VaultSummary {
  const { password, fields, notes, document, source, ...metadata } = item;
  return {
    ...metadata,
    source: source
      ? { label: source.label, capturedAt: source.capturedAt }
      : undefined,
    fieldCount: fields.length,
  };
}
export function effectiveRecords(
  items: VaultItem[],
  overrides: DataOverride[],
  scope?: string
): VaultItem[] {
  return items
    .filter((item) => !item.scope || item.scope === scope)
    .flatMap<VaultItem>((item) => {
      if (item.scope || !scope) return [{ ...item, inherited: false }];
      const override = overrides.find(
        (entry) => entry.scope === scope && entry.recordId === item.id
      );
      if (override?.hidden) return [];
      const fields = item.fields
        .filter((field) => !override?.removedFields?.includes(field.name))
        .map(
          (field) =>
            override?.fields?.find((entry) => entry.name === field.name) ||
            field
        );
      override?.fields?.forEach((field) => {
        if (!fields.some((entry) => entry.name === field.name))
          fields.push(field);
      });
      return [
        {
          ...item,
          ...override?.patch,
          fields,
          inherited: true,
          overridden: !!override,
        },
      ];
    });
}
export function difference(
  base: VaultItem,
  next: VaultItem,
  scope: string
): DataOverride {
  const patch: DataOverride['patch'] = {};
  (
    ['title', 'origin', 'username', 'password', 'notes', 'allowAI'] as const
  ).forEach((key) => {
    if ((next[key] ?? '') !== (base[key] ?? ''))
      Object.assign(patch, { [key]: next[key] });
  });
  return {
    scope,
    recordId: base.id,
    patch,
    fields: next.fields.filter((field) => {
      const original = base.fields.find((entry) => entry.name === field.name);
      if (!original) return true;
      return (
        JSON.stringify({ ...field, aliases: field.aliases || [] }) !==
        JSON.stringify({ ...original, aliases: original.aliases || [] })
      );
    }),
    removedFields: base.fields
      .filter(
        (field) => !next.fields.some((entry) => entry.name === field.name)
      )
      .map((field) => field.name),
  };
}
export function safeRecord(item: VaultItem) {
  return {
    id: item.id,
    title: item.title,
    kind: item.kind,
    source: recordSource(item),
    origin: item.origin,
    username: item.kind === 'login' ? item.username : '',
    fields:
      item.kind === 'login'
        ? []
        : item.fields.filter((field) => !isProtectedField(field)),
    notes: ['payment', 'login'].includes(item.kind) ? '' : item.notes || '',
    document:
      item.document && !['login', 'payment'].includes(item.kind)
        ? { name: item.document.name, text: item.document.text }
        : undefined,
  };
}
export function searchRecords(
  items: VaultItem[],
  query: string
): PersonalMatch[] {
  if (typeof query !== 'string' || !query.trim() || query.length > 500)
    throw new Error('Enter a search query (up to 500 characters).');
  const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const candidates = items
    .filter((item) => item.allowAI)
    .map((item) => {
      const safe = safeRecord(item);
      const text =
        item.kind === 'note'
          ? item.title
          : `${item.title} ${safe.origin} ${safe.username}\n${safe.fields
              .map(
                (field) =>
                  `${field.name} ${(field.aliases || []).join(' ')}: ${
                    field.value
                  }`
              )
              .join('\n')}\n${safe.notes}\n${safe.document?.text || ''}`;
      const lower = text.toLowerCase();
      const score = terms.reduce(
        (sum, term) =>
          sum +
          (lower.includes(term) ? 1 : 0) +
          (item.title.toLowerCase().includes(term) ? 2 : 0),
        0
      );
      const at = Math.max(
        0,
        lower.indexOf(terms.find((term) => lower.includes(term)) || '')
      );
      return {
        score,
        match: {
          id: item.id,
          title: item.title,
          kind: item.kind,
          source: item.source?.label || safe.document?.name || safe.source,
          excerpt:
            item.kind === 'note'
              ? ''
              : text.slice(Math.max(0, at - 100), at + 550),
        },
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const result: PersonalMatch[] = [];
  candidates.forEach(({ match }) => {
    if (JSON.stringify([...result, match]).length <= 4000) result.push(match);
  });
  return result;
}
