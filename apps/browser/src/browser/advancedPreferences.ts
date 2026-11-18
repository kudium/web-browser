export interface ProxyPreference {
  mode: 'system' | 'direct' | 'fixed_servers' | 'pac_script';
  rules: string;
  pacURL: string;
  bypass: string;
}
export interface SiteRule {
  origin: string;
  javascript: boolean;
  images: boolean;
  autoplay: boolean;
  popups: boolean;
  zoom: number;
  userAgent: string;
}
export interface AdvancedPreferences {
  dnsMode: 'automatic' | 'off' | 'secure';
  dnsProvider: 'system' | 'cloudflare' | 'google' | 'quad9' | 'custom';
  dnsEndpoint: string;
  proxy: ProxyPreference;
  profileProxies: Record<string, ProxyPreference>;
  userAgent: string;
  profileUserAgents: Record<string, string>;
  acceptLanguages: string;
  cookies: 'allow' | 'block-third-party-http' | 'block-all-http';
  cookieExceptions: string[];
  clearOnExit: boolean;
  referrer: 'default' | 'none' | 'origin';
  trackingProtection: boolean;
  adBlocking: boolean;
  trackingExceptions: string[];
  webrtc:
    | 'default'
    | 'default_public_interface_only'
    | 'disable_non_proxied_udp';
  javascript: boolean;
  images: boolean;
  autoplay: boolean;
  siteRules: SiteRule[];
  hardwareAcceleration: boolean;
  energySaver: boolean;
  startupMode: 'restore' | 'pages';
  startupPages: string[];
}
export const defaultProxy: ProxyPreference = {
  mode: 'system',
  rules: '',
  pacURL: '',
  bypass: '',
};
export const defaultAdvanced: AdvancedPreferences = {
  dnsMode: 'automatic',
  dnsProvider: 'system',
  dnsEndpoint: '',
  proxy: defaultProxy,
  profileProxies: {},
  userAgent: '',
  profileUserAgents: {},
  acceptLanguages: '',
  cookies: 'allow',
  cookieExceptions: [],
  clearOnExit: false,
  referrer: 'default',
  trackingProtection: false,
  adBlocking: true,
  trackingExceptions: [],
  webrtc: 'default',
  javascript: true,
  images: true,
  autoplay: true,
  siteRules: [],
  hardwareAcceleration: true,
  energySaver: true,
  startupMode: 'restore',
  startupPages: [],
};
export const dnsProviders = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
};
function text(value: unknown, name: string, limit = 2048): string {
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    value.includes('\0') ||
    /[\r\n]/.test(value)
  )
    throw new Error(`Invalid ${name}`);
  return value.trim();
}
function option<T extends string>(
  value: unknown,
  options: readonly T[],
  name: string
): T {
  if (!options.includes(value as T)) throw new Error(`Invalid ${name}`);
  return value as T;
}
function webURL(value: unknown, name: string, https = false): string {
  const result = text(value, name);
  const url = new URL(result);
  if (
    !(https ? ['https:'] : ['http:', 'https:']).includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(`Invalid ${name}`);
  return result;
}
function list(value: unknown, name: string, originOnly = false): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error(`Invalid ${name}`);
  return [
    ...new Set(
      value.map((item) =>
        originOnly ? new URL(webURL(item, name)).origin : webURL(item, name)
      )
    ),
  ];
}
export function validateProxy(value: unknown): ProxyPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid proxy');
  const input = value as ProxyPreference;
  const mode = option(
    input.mode,
    ['system', 'direct', 'fixed_servers', 'pac_script'],
    'proxy mode'
  );
  const rules = text(input.rules, 'proxy rules');
  const pacURL = text(input.pacURL, 'PAC URL');
  const bypass = text(input.bypass, 'proxy bypass rules');
  if (
    mode === 'fixed_servers' &&
    (!rules ||
      /[@\s]/.test(rules) ||
      !rules
        .split(';')
        .every((rule) =>
          /^(?:(?:http|https|ftp|socks)=)?(?:(?:https?|socks[45]?):\/\/)?(?:\[[a-f\d:]+\]|[a-z\d.-]+):\d{1,5}$/i.test(
            rule
          )
        ))
  )
    throw new Error(
      'Use proxy host:port or socks5://host:port; authenticated proxies are not supported yet.'
    );
  if (
    mode === 'fixed_servers' &&
    rules.split(';').some((rule) => {
      const port = Number(rule.match(/:(\d+)$/)?.[1]);
      return port < 1 || port > 65535;
    })
  )
    throw new Error('Proxy ports must be between 1 and 65535.');
  if (mode === 'pac_script') webURL(pacURL, 'PAC URL');
  return { mode, rules, pacURL, bypass };
}
function profiles<T>(
  value: unknown,
  validate: (item: unknown) => T
): Record<string, T> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 256
  )
    throw new Error('Invalid session overrides');
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (
        !key ||
        key.length > 256 ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        throw new Error('Invalid session ID');
      return [key, validate(item)];
    })
  );
}
export function validateAdvanced(value: unknown): AdvancedPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid advanced preferences');
  const input = { ...defaultAdvanced, ...value } as AdvancedPreferences;
  Object.keys(value).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(defaultAdvanced, key))
      throw new Error(`Unknown advanced preference: ${key}`);
  });
  const result = { ...input };
  result.dnsMode = option(
    input.dnsMode,
    ['automatic', 'off', 'secure'],
    'DNS mode'
  );
  result.dnsProvider = option(
    input.dnsProvider,
    ['system', 'cloudflare', 'google', 'quad9', 'custom'],
    'DNS provider'
  );
  result.dnsEndpoint = text(input.dnsEndpoint, 'DNS endpoint');
  if (result.dnsProvider === 'custom')
    webURL(result.dnsEndpoint, 'DNS endpoint', true);
  if (result.dnsMode === 'secure' && result.dnsProvider === 'system')
    throw new Error('Choose a DNS provider for secure-only DNS.');
  result.proxy = validateProxy(input.proxy);
  result.profileProxies = profiles(input.profileProxies, validateProxy);
  result.userAgent = text(input.userAgent, 'user agent');
  result.profileUserAgents = profiles(input.profileUserAgents, (item) =>
    text(item, 'user agent')
  );
  result.acceptLanguages = text(
    input.acceptLanguages,
    'website languages',
    256
  );
  if (
    result.acceptLanguages &&
    !result.acceptLanguages
      .split(',')
      .every((language) =>
        /^[a-z]{2,3}(?:-[a-z\d]{2,8})*(?:;q=0(?:\.\d{1,3})?|;q=1(?:\.0{1,3})?)?$/i.test(
          language.trim()
        )
      )
  )
    throw new Error('Use language tags such as en-CA,en,fr.');
  result.cookies = option(
    input.cookies,
    ['allow', 'block-third-party-http', 'block-all-http'],
    'cookie policy'
  );
  result.cookieExceptions = list(
    input.cookieExceptions,
    'cookie exceptions',
    true
  );
  result.trackingExceptions = list(
    input.trackingExceptions,
    'tracking exceptions',
    true
  );
  result.referrer = option(
    input.referrer,
    ['default', 'none', 'origin'],
    'referrer policy'
  );
  result.webrtc = option(
    input.webrtc,
    ['default', 'default_public_interface_only', 'disable_non_proxied_udp'],
    'WebRTC policy'
  );
  result.startupMode = option(
    input.startupMode,
    ['restore', 'pages'],
    'startup mode'
  );
  result.startupPages = list(input.startupPages, 'startup pages');
  if (result.startupMode === 'pages' && !result.startupPages.length)
    throw new Error('Add at least one startup page.');
  [
    'clearOnExit',
    'trackingProtection',
    'adBlocking',
    'javascript',
    'images',
    'autoplay',
    'hardwareAcceleration',
    'energySaver',
  ].forEach((key) => {
    if (typeof input[key as keyof AdvancedPreferences] !== 'boolean')
      throw new Error(`Invalid ${key}`);
  });
  if (!Array.isArray(input.siteRules) || input.siteRules.length > 256)
    throw new Error('Invalid site rules');
  const origins = new Set<string>();
  result.siteRules = input.siteRules.map((rule) => {
    const { origin } = new URL(webURL(rule.origin, 'site origin'));
    if (origins.has(origin)) throw new Error('Duplicate site rule');
    origins.add(origin);
    if (
      !['javascript', 'images', 'autoplay', 'popups'].every(
        (key) => typeof rule[key as keyof SiteRule] === 'boolean'
      ) ||
      !Number.isFinite(rule.zoom) ||
      rule.zoom < 0.25 ||
      rule.zoom > 5
    )
      throw new Error('Invalid site behavior');
    return {
      origin,
      javascript: rule.javascript,
      images: rule.images,
      autoplay: rule.autoplay,
      popups: rule.popups,
      zoom: rule.zoom,
      userAgent: text(rule.userAgent, 'site user agent'),
    };
  });
  return result;
}
export function siteRule(preferences: AdvancedPreferences, url: string) {
  try {
    return preferences.siteRules.find(
      (rule) => rule.origin === new URL(url).origin
    );
  } catch {
    return undefined;
  }
}
