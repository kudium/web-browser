import { expect, test } from 'bun:test';
import { authConfig, serviceOrigin } from '../src/config';
const secret = 'a-test-secret-of-at-least-32-characters';
test('Better Auth requires a secret, uses the chosen domain and validates local/production origins', () => {
  expect(serviceOrigin).toBe('https://browser.kudium.com');
  expect(() => authConfig({})).toThrow();
  expect(() => authConfig({ BETTER_AUTH_SECRET: 'short' })).toThrow();
  expect(authConfig({ BETTER_AUTH_SECRET: secret }).baseURL).toBe(serviceOrigin);
  expect(authConfig({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost:3000' }).baseURL).toBe('http://localhost:3000');
  expect(() => authConfig({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'http://localhost:3000', NODE_ENV: 'production' })).toThrow();
  expect(() => authConfig({ BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: 'https://browser.kudium.com/path' })).toThrow();
  expect(() => authConfig({ BETTER_AUTH_SECRET: secret, SMTP_URL: 'smtp://localhost' })).toThrow();
});
