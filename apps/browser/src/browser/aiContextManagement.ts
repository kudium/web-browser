import { isAppleAIEndpoint } from './aiProviders';

export const aiContextManagement = (
  endpoint: string,
  preference?: unknown
): boolean =>
  typeof preference === 'boolean' ? preference : isAppleAIEndpoint(endpoint);
export const aiContextModelKey = (endpoint: string, model: string) =>
  JSON.stringify([endpoint.replace(/\/$/, ''), model]);
