import { expect, test } from 'bun:test';
import { smtpTransportOptions } from '../src/config';
import { createApp } from '../src/app';
import type { Database } from '../src/db';

test('remote SMTP requires TLS and cannot disable certificate/transport policy through URL options', () => {
  expect(smtpTransportOptions('smtp://user:password@smtp.example.com:587', 'https://browser.kudium.com').requireTLS).toBe(true);
  expect(smtpTransportOptions('smtps://user:password@smtp.example.com:465', 'https://browser.kudium.com').requireTLS).toBe(true);
  for (const value of ['http://smtp.example.com', 'smtp://smtp.example.com?ignoreTLS=true', 'smtps://smtp.example.com?tls.rejectUnauthorized=false', 'smtp://smtp.example.com/path', 'smtp://127.0.0.1:1025']) {
    expect(() => smtpTransportOptions(value, 'https://browser.kudium.com')).toThrow();
  }
  expect(smtpTransportOptions('smtp://127.0.0.1:1025', 'http://localhost:3000').requireTLS).toBe(false);
});

test('authentication responses cannot be cached and oversized payloads never reach the auth handler', async () => {
  const app = createApp({ db: {} as Database, assetOrigins: [] });
  const session = await app.request('/api/auth/get-session');
  expect(session.headers.get('cache-control')).toBe('no-store');
  const oversized = await app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'fixture@example.test', password: 'x'.repeat(65536) }) });
  expect(oversized.status).toBe(413);
  expect(oversized.headers.get('cache-control')).toBe('no-store');
});
