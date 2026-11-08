# Advanced browser preferences

Kudium Browser now exposes Network, Compatibility, Website behavior and Startup preferences, plus additional Privacy, Languages and Performance controls. Standard controls save immediately; advanced controls are edited as a draft and require **Save advanced settings**. Discard cancels the draft. Reset advanced defaults selects a draft that must be saved.

## Scope and application

- DNS-over-HTTPS is app-wide: automatic with fallback, secure-only, or off; providers are system, Cloudflare, Google, Quad9 and a custom HTTPS POST endpoint. Secure-only requires a provider.
- Proxy and user-agent defaults can be overridden by login session. Sessions sharing login state also share their network configuration. Proxy modes are system, direct, HTTP/HTTPS/SOCKS fixed servers, and PAC URL, with Chromium bypass rules. User-agent headers use the actual Chromium version by default.
- Proxy changes close existing session connections. The settings IPC response and initial tab load wait for configuration to settle. **Test connection** uses the chosen session and reports the effective proxy, HTTPS response and elapsed time. Its reported DNS setting does not prove which resolver handled that individual request. Global diagnostics use the first open session.
- Website language headers accept ordered BCP-47 tags independently of spelling. Leave blank for system defaults.
- Exact-origin website rules override global JavaScript, images, autoplay, popup behavior, zoom and session user-agent identity. They apply across login sessions. Script and image changes require a reload, autoplay requires reopening the tab, and custom identity changes should be followed by reopening the tab. Zoom and popup preferences apply live.
- Script/image policy appends restrictive CSP headers to document responses and blocks corresponding requests. Existing website CSP remains intact. Extension schemes are excluded from these HTTP hooks.
- Hardware acceleration is read before app readiness and requires an app restart. Energy saver permits Chromium background throttling. Process memory and GPU status can be inspected.
- Startup restores the existing workspace or opens chosen pages once per app launch. Saved groups remain available. The default-browser button requests OS protocol registration; the OS may require confirmation or manual Default Apps selection.

## Privacy and practical limits

HTTP cookie controls filter outgoing Cookie and incoming Set-Cookie headers, using schemeful registrable sites (including private public-suffix entries) to distinguish third parties. This is **not** complete third-party storage isolation: document.cookie, localStorage and IndexedDB are not blocked. Exact top-level origin exceptions allow HTTP cookies.

Basic tracking protection uses a deliberately small built-in domain list: DoubleClick, Google Analytics, Google Syndication, Facebook Connect and TikTok Analytics. It does not claim comprehensive ad or tracker blocking. Exact-origin exceptions disable the list for a website.

Referrer controls affect HTTP Referer headers. WebRTC controls use Chromium's IP-handling policy, including disabling non-proxied UDP. Restrictive policies can affect calling websites.

Clear-on-exit removes website cookies, localStorage, IndexedDB and service workers from Kudium Browser session partitions on normal Quit, preserving extension storage. A failed cleanup keeps the app open and reports the failure. Forced termination cannot run cleanup. Storage inspection reports HTTP cache bytes and cookie count, not total IndexedDB/localStorage disk usage.

Network logs use the default capture mode and are saved through a native file picker. They can contain visited URLs. Authenticated proxy credentials are not supported; credentials embedded in proxy rules or PAC URLs are rejected. Arbitrary custom user agents do not change the browser engine or all JavaScript browser metadata and can affect verification.

## Cloudflare and AI

The automatic identity defaults preserve the app/session/tab consistency required by the earlier Cloudflare fix. AI page observations flag recognizable pending Cloudflare verification. The assistant can wait for automatic verification, then hand the current tab to the human if verification is required. It must not solve, click or bypass Turnstile/CAPTCHA controls; the human explicitly continues afterward.

## Validation

- `advancedPreferences.test.ts`: DNS requirements, header injection, session proxy input, site rules, exceptions, startup URLs and third-party classification.
- `advanced-preferences-smoke.cjs`: native cross-site request identity, website languages, WebRTC, inline/external script and image blocking, site exception/zoom, HTTP cookie filtering and per-session proxy routing against local fixtures.
- `advanced-settings-ui-smoke.cjs`: production renderer preferences, real IPC persistence and desktop/narrow layout screenshots.
- `aiSnapshot.test.ts`: pending Cloudflare metadata without a solving action.

The native smoke tests are included in `npm test -- --desktop`.
