import type { VaultItem, DataOverride } from '../../browser/passwordManager';
import { isProtectedField } from '../../browser/passwordManager';
import { effectiveRecords } from './records';
export function autofillMetadata(
  items: VaultItem[],
  overrides: DataOverride[],
) {
  const project = (item: VaultItem) => ({
    id: item.id,
    origin: item.origin,
    scope: item.scope,
    kind: item.kind,
    canFillLogin: item.kind === 'login' && !!item.password,
    fields: item.fields
      .filter((field) => field.value)
      .map((field) => ({
        name: field.name,
        aliases: field.aliases,
        secret: isProtectedField(field),
      })),
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  return {
    records: items.map(project),
    overrides: overrides.map((override) => {
      const base = byId.get(override.recordId);
      const item =
        base && effectiveRecords([base], [override], override.scope)[0];
      return {
        id: override.recordId,
        scope: override.scope,
        record: item ? project(item) : undefined,
      };
    }),
  };
}
export class AutofillMetadataCache {
  private scopes = new Map<
    string | undefined,
    ReturnType<typeof autofillMetadata>['records']
  >();
  constructor(private metadata: ReturnType<typeof autofillMetadata>) {}
  availability(origin: string, scope?: string) {
    let records = this.scopes.get(scope);
    if (!records) {
      const overrides = new Map(
        this.metadata.overrides
          .filter((item) => item.scope === scope)
          .map((item) => [item.id, item]),
      );
      records = this.metadata.records
        .filter((item) => !item.scope || item.scope === scope)
        .flatMap((item) => {
          const override =
            scope && !item.scope ? overrides.get(item.id) : undefined;
          return override ? (override.record ? [override.record] : []) : [item];
        });
      this.scopes.set(scope, records);
    }
    return records
      .filter(
        (item) =>
          (!item.origin || item.origin === origin) &&
          ['profile', 'knowledge', 'login'].includes(item.kind),
      )
      .sort((a, b) => Number(!!b.origin) - Number(!!a.origin))
      .slice(0, 50)
      .map(({ kind, canFillLogin, fields }) => ({
        kind,
        canFillLogin,
        fields,
      }));
  }
}
