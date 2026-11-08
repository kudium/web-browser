import {
  defaultAdvanced,
  validateAdvanced,
  validateProxy,
} from '../browser/advancedPreferences';

import { blockedTracker, thirdParty } from '../main/advancedPreferences';

jest.mock('../main/siteData', () => ({ clearSessionSiteData: jest.fn() }));

it('validates DNS endpoints and secure-only mode without silently falling back', () => {
  expect(() =>
    validateAdvanced({ ...defaultAdvanced, dnsMode: 'secure' })
  ).toThrow('Choose a DNS provider');
  expect(() =>
    validateAdvanced({
      ...defaultAdvanced,
      dnsProvider: 'custom',
      dnsEndpoint: 'http://resolver.example/dns-query',
    })
  ).toThrow('Invalid DNS endpoint');
  expect(
    validateAdvanced({
      ...defaultAdvanced,
      dnsMode: 'secure',
      dnsProvider: 'quad9',
    }).dnsMode
  ).toBe('secure');
});
it('rejects header injection and validates session proxy overrides', () => {
  expect(() =>
    validateAdvanced({
      ...defaultAdvanced,
      userAgent: 'Chrome\r\nCookie: secret',
    })
  ).toThrow('Invalid user agent');
  expect(() =>
    validateAdvanced({
      ...defaultAdvanced,
      acceptLanguages: 'en-US\r\nOrigin: fake',
    })
  ).toThrow('Invalid website languages');
  expect(() =>
    validateProxy({
      mode: 'fixed_servers',
      rules: 'user:password@host:1080',
      pacURL: '',
      bypass: '',
    })
  ).toThrow('Use proxy');
  expect(
    validateAdvanced({
      ...defaultAdvanced,
      profileProxies: {
        work: {
          mode: 'fixed_servers',
          rules: 'socks5://127.0.0.1:1080',
          pacURL: '',
          bypass: 'localhost',
        },
      },
    }).profileProxies.work.rules
  ).toBe('socks5://127.0.0.1:1080');
  expect(() =>
    validateAdvanced({
      ...defaultAdvanced,
      profileUserAgents: JSON.parse('{"__proto__":"bad"}'),
    })
  ).toThrow('Invalid session ID');
});
it('normalizes exceptions, preserves site rules and rejects duplicates', () => {
  expect(
    validateAdvanced({
      ...defaultAdvanced,
      cookieExceptions: ['https://example.com/path', 'https://example.com/'],
    }).cookieExceptions
  ).toEqual(['https://example.com']);
  const rule = {
    origin: 'https://example.com',
    javascript: false,
    images: true,
    autoplay: false,
    popups: false,
    zoom: 1.25,
    userAgent: '',
  };
  expect(
    validateAdvanced({ ...defaultAdvanced, siteRules: [rule] }).siteRules
  ).toEqual([rule]);
  expect(() =>
    validateAdvanced({ ...defaultAdvanced, siteRules: [rule, rule] })
  ).toThrow('Duplicate site rule');
  expect(() =>
    validateAdvanced({
      ...defaultAdvanced,
      startupMode: 'pages',
      startupPages: [],
    })
  ).toThrow('Add at least one');
});
it('uses schemeful registrable sites for HTTP cookie policy, including private suffixes', () => {
  expect(
    thirdParty('https://cdn.example.co.uk/a', 'https://www.example.co.uk')
  ).toBe(false);
  expect(thirdParty('https://other.co.uk', 'https://example.co.uk')).toBe(true);
  expect(thirdParty('http://example.com', 'https://example.com')).toBe(true);
  expect(thirdParty('https://b.github.io', 'https://a.github.io')).toBe(true);
  expect(blockedTracker('https://google-analytics.com/collect')).toBe(true);
  expect(blockedTracker('https://google-analytics.com.attacker.example')).toBe(
    false
  );
});
