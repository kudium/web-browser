import { expect, test } from 'bun:test';
import { authEmail } from '../src/auth-email';

test('auth emails provide branded HTML, inline logo, download link and plain text', () => {
  for (const kind of ['verification', 'password-reset', 'email-change'] as const) {
    const email = authEmail(kind, 'https://browser.kudium.com/action?token=example&next=home', 'new@example.com');
    expect(email.html).toContain('src="cid:kudium-logo"');
    expect(email.attachments[0].content.length).toBeGreaterThan(0);
    expect(email.attachments[0].cid).toBe('kudium-logo');
    expect(email.html).toContain('https://browser.kudium.com/download');
    expect(email.text).toContain('https://browser.kudium.com/download');
    expect(email.html).toContain('token=example&amp;next=home');
    expect(email.text).toContain('token=example&next=home');
  }
});

test('email change details cannot inject HTML', () => {
  const email = authEmail('email-change', 'https://browser.kudium.com/action', '<img src=x onerror=alert(1)>');
  expect(email.html).toContain('&lt;img');
  expect(email.html).not.toContain('<img src=x');
});
