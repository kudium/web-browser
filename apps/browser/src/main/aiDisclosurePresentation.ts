/** Present the reviewed snapshot without API payload syntax or internal IDs. */
export function readableAIData(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value))
    return value.map(readableAIData).filter(Boolean).join('\n\n');
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string' && 'value' in record)
    return `${record.name}: ${readableAIData(record.value)}`;
  return Object.entries(record)
    .filter(([key]) => !['id', 'recordId', 'nextOffset'].includes(key))
    .map(([key, item]) => {
      const text = readableAIData(item);
      if (!text) return '';
      const label = key.replace(/([a-z])([A-Z])/g, '$1 $2');
      return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${text}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function aiDisclosureDetail(
  snapshot: string,
  endpoint: string,
  external: boolean,
  continuing: boolean
): string {
  let recipient: string;
  try {
    recipient = new URL(endpoint).host;
  } catch {
    recipient = endpoint;
  }
  const data = JSON.parse(snapshot);
  const content = continuing
    ? 'This chat’s previous messages and replies, including saved information you shared earlier.'
    : readableAIData(data);
  return `${
    external
      ? 'Recipient: connected external AI client (its provider is unknown).'
      : `Recipient: ${recipient}`
  }\n\n${content}\n\n${
    continuing
      ? 'Allow this chat to continue with this provider. New saved information still needs approval.'
      : 'Allow only these details to be shared. They may remain in this chat and with the provider.'
  }`;
}
