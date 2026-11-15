import type { VaultItem } from "../../../browser/src/browser/passwordManager";

export type SyncedPersonalItem = Pick<
  VaultItem,
  | "id"
  | "title"
  | "origin"
  | "kind"
  | "scope"
  | "source"
  | "notes"
  | "document"
  | "username"
  | "password"
  | "fields"
  | "sensitive"
>;
/** Sync never exports AI grants or inherited copies. */
export function personalDataForSync(items: VaultItem[]): SyncedPersonalItem[] {
  return validateSyncedPersonalData(
    items
      .filter((item) => item.kind !== "note")
      .map(
        ({
          id,
          title,
          origin,
          kind,
          scope,
          source,
          notes,
          document,
          username,
          password,
          fields,
          sensitive,
        }) => ({
          id,
          title,
          origin,
          kind,
          scope,
          source,
          notes,
          document,
          username,
          password,
          fields,
          sensitive,
        }),
      ),
  );
}
export function validateSyncedPersonalData(
  value: unknown,
): SyncedPersonalItem[] {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error("Invalid personal data backup.");
  const ids = new Set<string>();
  const string = (value: unknown, max: number) =>
    typeof value === "string" && value.length <= max;
  return value.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Object.keys(item).some(
        (key) =>
          ![
            "id",
            "title",
            "origin",
            "kind",
            "scope",
            "source",
            "notes",
            "document",
            "username",
            "password",
            "fields",
            "sensitive",
          ].includes(key),
      ) ||
      !string(item.id, 100) ||
      !/^[a-zA-Z0-9_-]+$/.test(item.id) ||
      ids.has(item.id) ||
      !string(item.title, 120) ||
      !["login", "profile", "payment", "knowledge"].includes(item.kind) ||
      !string(item.origin, 4096) ||
      (item.scope !== undefined && !string(item.scope, 200)) ||
      (item.sensitive !== undefined && typeof item.sensitive !== "boolean") ||
      (item.notes !== undefined && !string(item.notes, 100000)) ||
      !string(item.username, 1000) ||
      !string(item.password, 4096) ||
      !Array.isArray(item.fields) ||
      item.fields.length > 30 ||
      item.fields.some(
        (field: any) =>
          !field ||
          Object.keys(field).some(
            (key) => !["name", "value", "secret", "aliases"].includes(key),
          ) ||
          !string(field.name, 120) ||
          !string(field.value, 4096) ||
          typeof field.secret !== "boolean" ||
          (field.aliases !== undefined &&
            (!Array.isArray(field.aliases) ||
              field.aliases.length > 30 ||
              field.aliases.some((alias: unknown) => !string(alias, 120)))),
      ) ||
      (item.source &&
        (Object.keys(item.source).some(
          (key) => !["label", "url", "capturedAt"].includes(key),
        ) ||
          !string(item.source.label, 200) ||
          !string(item.source.capturedAt, 100) ||
          (item.source.url !== undefined && !string(item.source.url, 4096)))) ||
      (item.document &&
        (Object.keys(item.document).some(
          (key) => !["name", "mime", "content", "text"].includes(key),
        ) ||
          !string(item.document.name, 200) ||
          ![
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
            "text/markdown",
          ].includes(item.document.mime) ||
          !string(item.document.content, 28 * 1024 * 1024) ||
          !string(item.document.text, 2000000) ||
          Buffer.from(item.document.content, "base64").toString("base64") !==
            item.document.content))
    )
      throw new Error("Invalid personal data item.");
    ids.add(item.id);
    return item as SyncedPersonalItem;
  });
}
