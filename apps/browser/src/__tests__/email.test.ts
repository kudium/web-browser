/** @jest-environment node */
import {
  EMAIL_PROVIDERS,
  aliasFor,
  emailProvider,
  extractLinks,
  extractVerificationCodes,
  htmlToText,
  matchesEmailFilter,
  normalizeHostname,
  validateEmailProviderValues,
} from '../browser/email';

describe('provider catalog', () => {
  it('declares one alias and one mailbox provider with secret fields', () => {
    expect(EMAIL_PROVIDERS.map((provider) => [provider.id, provider.kind, provider.auth || 'fields'])).toEqual([
      ['simplelogin', 'alias', 'fields'],
      ['google', 'mailbox', 'oauth'],
      ['microsoft', 'mailbox', 'oauth'],
      ['imap', 'mailbox', 'fields'],
    ]);
    expect(emailProvider('simplelogin')!.fields.filter((field) => field.secret).map((field) => field.key)).toEqual([
      'apiKey',
    ]);
    expect(emailProvider('imap')!.fields.filter((field) => field.secret).map((field) => field.key)).toEqual([
      'password',
    ]);
  });
  it('validates submitted values, applies defaults and rejects bad ports', () => {
    const simplelogin = emailProvider('simplelogin')!;
    expect(validateEmailProviderValues(simplelogin, { apiKey: ' key ' })).toEqual({
      apiKey: 'key',
      baseUrl: 'https://app.simplelogin.io',
    });
    expect(() => validateEmailProviderValues(simplelogin, { apiKey: '' })).toThrow('API key is required.');
    expect(() => validateEmailProviderValues(simplelogin, { apiKey: 'a\nb' })).toThrow('API key is invalid.');
    const imap = emailProvider('imap')!;
    expect(validateEmailProviderValues(imap, { host: 'imap.example.com', user: 'me', password: 'pw' })).toEqual({
      host: 'imap.example.com',
      port: '993',
      user: 'me',
      password: 'pw',
    });
    expect(() =>
      validateEmailProviderValues(imap, { host: 'imap.example.com', port: '70000', user: 'me', password: 'pw' })
    ).toThrow('Port must be a number');
    expect(() => validateEmailProviderValues(imap, null)).toThrow('Provider settings are required.');
  });
});

describe('hostnames', () => {
  it('accepts hosts and URLs and rejects junk', () => {
    expect(normalizeHostname('https://www.Example.com/signup?x=1')).toBe('example.com');
    expect(normalizeHostname('app.example.co.uk')).toBe('app.example.co.uk');
    expect(normalizeHostname('www.example.com/path')).toBe('example.com');
    expect(normalizeHostname('not a host')).toBeUndefined();
    expect(normalizeHostname('localhost')).toBeUndefined();
    expect(normalizeHostname('javascript:alert(1)')).toBeUndefined();
    expect(normalizeHostname(42)).toBeUndefined();
  });
});

describe('message parsing helpers', () => {
  it('turns HTML into readable text', () => {
    expect(htmlToText('<style>p{}</style><p>Hi&nbsp;there,</p><div>Your code is <b>123456</b>.</div><br>Bye &amp; thanks')).toBe(
      'Hi there,\nYour code is 123456 .\n\nBye & thanks'
    );
  });
  it('ranks verification links first and drops trackers and non-http links', () => {
    const html =
      '<a href="https://x.test/unsubscribe?u=1">Unsubscribe</a> <a href="https://x.test/verify?token=abc&amp;x=1">Verify</a> <a href="mailto:a@b.c">Mail</a>';
    const text = 'Or open https://x.test/help. Thanks';
    expect(extractLinks(text, html)).toEqual([
      'https://x.test/verify?token=abc&x=1',
      'https://x.test/help',
      'https://x.test/unsubscribe?u=1',
    ]);
  });
  it('extracts likely one-time codes without years or phone numbers', () => {
    expect(extractVerificationCodes('Your verification code is 482913. It expires in 2024.')).toEqual(['482913']);
    expect(extractVerificationCodes('Enter code: 4821 to continue. Call +1 415 555 0199 for help.')).toEqual(['4821']);
    expect(extractVerificationCodes('Use passcode ABCD-1234 now')).toEqual(['ABCD-1234']);
    expect(extractVerificationCodes('Order #1234567 shipped on 12/03/2024')).toEqual([]);
  });
  it('matches filters on recipient, sender, subject and time', () => {
    const message = {
      id: '1',
      from: 'Example <no-reply@example.com>',
      to: ['Alias <quiet.river@simplelogin.com>'],
      subject: 'Confirm your account',
      receivedAt: 1000,
      text: '',
      links: [],
      codes: [],
    };
    expect(matchesEmailFilter(message, { since: 500, to: 'quiet.river@simplelogin.com' })).toBe(true);
    expect(matchesEmailFilter(message, { since: 500, to: 'other@simplelogin.com' })).toBe(false);
    expect(matchesEmailFilter(message, { since: 500, from: 'example.com', subject: 'confirm' })).toBe(true);
    expect(matchesEmailFilter(message, { since: 2000 })).toBe(false);
    expect(aliasFor(message, [{ email: 'Quiet.River@simplelogin.com' }])).toBe('Quiet.River@simplelogin.com');
    expect(aliasFor(message, [{ email: 'nope@simplelogin.com' }])).toBeUndefined();
  });
});
