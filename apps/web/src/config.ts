export const serviceOrigin = 'https://webbrowser.kudium.com';
export type AuthConfig = { secret: string; baseURL: string; smtpURL?: string; smtpFrom?: string };
export function authConfig(env: Record<string, string | undefined>): AuthConfig {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters');
  const url = new URL(env.BETTER_AUTH_URL ?? serviceOrigin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && env.NODE_ENV !== 'production'))) throw new Error('BETTER_AUTH_URL must be an HTTPS origin (HTTP loopback is allowed for development)');
  if (Boolean(env.SMTP_URL) !== Boolean(env.SMTP_FROM)) throw new Error('Configure both SMTP_URL and SMTP_FROM, or leave both unset');
  return { secret, baseURL: url.origin, smtpURL: env.SMTP_URL, smtpFrom: env.SMTP_FROM };
}
