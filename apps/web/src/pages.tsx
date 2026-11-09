import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { serviceOrigin } from "./config";
import { tutorials, type Tutorial } from "./tutorials";
import type { groupReleaseHistory, ReleaseHistoryEntry } from "./releases";
const githubUrl = "https://github.com/kudium/web-browser";
const sponsorsUrl = "https://github.com/sponsors/kudium";
function Layout({
  children,
  docs = false,
  privatePage = false,
  title,
  canonicalPath,
}: {
  children: ReactNode;
  docs?: boolean;
  privatePage?: boolean;
  title?: string;
  canonicalPath?: string;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${
          title ||
          (docs
            ? "Documentation"
            : privatePage
            ? "Your account"
            : "A little less browser. A lot more workspace.")
        } · Kudium Browser`}</title>
        <meta
          name="description"
          content="Kudium brings your tabs, AI, project files and terminals into one focused browser workspace."
        />
        {privatePage ? (
          <meta name="robots" content="noindex" />
        ) : (
          <link
            rel="canonical"
            href={`${serviceOrigin}${canonicalPath || (docs ? "/docs" : "/")}`}
          />
        )}
        <link rel="icon" href="/assets/product/origin-logo.png" />
        <link rel="stylesheet" href="/assets/site.css?v=23" />
      </head>
      <body className={privatePage ? "account-page" : undefined}>
        <header>
          <a className="brand" href="/" aria-label="Kudium home">
            <img
              className="logo"
              src="/assets/product/origin-logo.png"
              width="28"
              height="31"
              alt=""
            />{" "}
            Kudium
          </a>
          <nav aria-label="Main navigation">
            <a href="/#highlights">Overview</a>
            <a href="/tutorials">Tutorials</a>
            <a href="/docs" aria-current={docs ? "page" : undefined}>
              Docs
            </a>
            <a className="account-link" href="/account">
              Account
            </a>
            <a className="nav-button" href="/download">
              Get Browser
            </a>
          </nav>
        </header>
        {children}
        <footer>
          <a className="brand" href="/">
            Kudium
          </a>
          <span>Free and open source.</span>
          <a href="/tutorials">Tutorials</a>
          <a href="/docs">Documentation</a>
          <a href="/releases">Release history</a>
          <a href={githubUrl}>GitHub</a>
          <a href={sponsorsUrl}>Support Kudium</a>
        </footer>
      </body>
    </html>
  );
}
export function homepage() {
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout>
        <main className="campaign">
          <section className="campaign-hero" aria-labelledby="hero-title">
            <h1 id="hero-title">Space to do more.</h1>
            <p className="hero-line">
              Everything you love about the web.
              <br />
              And room for everything you’re making.
            </p>
            <div className="campaign-actions">
              <a className="button" href="/download">
                Get Browser
              </a>
              <a className="text-link" href="#highlights">
                Explore the browser <span aria-hidden="true">›</span>
              </a>
            </div>
            <div
              className="hero-showcase"
              aria-label="Explore browser workflows"
              aria-roledescription="carousel"
            >
              <div className="hero-slides" tabIndex={0}>
                {[
                  [
                    "design-workspace",
                    "Organise your day with tab groups.",
                    "Social, work, design, development, and reading. Five groups, twenty everyday tabs, and your favorite tools within reach.",
                  ],
                  [
                    "sidebar-collapsed",
                    "More room for the web.",
                    "Hide the sidebar. Your Design group stays in the address bar, ready to switch whenever you need it.",
                  ],
                  [
                    "social-workspace",
                    "Keep your social tabs together.",
                    "YouTube, Reddit, Instagram, and LinkedIn. Keep your social tabs together, with a separate home for work.",
                  ],
                  [
                    "ai-context",
                    "Chat with AI beside your page.",
                    "Keep your page in view while you bring a project brief into the AI sidebar and plan your next move.",
                  ],
                  [
                    "ai-active-tabs",
                    "See which tabs AI is working on.",
                    "Open Active AI tabs above the Assistant input to see tab icons, activity status, and a shortcut to each page. Illustrated with two sample tabs.",
                  ],
                  [
                    "developer-workspace",
                    "Link your project to a tab group.",
                    "Link a local project to your development group. Keep its files and tools beside the web.",
                  ],
                  [
                    "developer-files",
                    "Browse and edit your project files.",
                    "Browse folders, filter files, and edit source without losing your place.",
                  ],
                  [
                    "developer-terminal",
                    "Run and test in the built-in terminal.",
                    "Run commands and check your project in the built-in terminal. This is a real test run.",
                  ],
                ].map(([image, title, description], index) => (
                  <figure
                    className="hero-slide"
                    id={`workflow-${index}`}
                    key={image}
                    aria-label={`${index + 1} of 8`}
                  >
                    <div className="hero-screen">
                      <img
                        src={`/assets/product/demo/${image}.webp?v=8`}
                        alt={description}
                        width="1440"
                        height="940"
                        loading={index ? "lazy" : "eager"}
                        fetchPriority={index ? "auto" : "high"}
                      />
                    </div>
                    <figcaption>
                      <h2>{title}</h2>
                      <p>{description}</p>
                      <a
                        className="text-link"
                        href={`/tutorials/${
                          [
                            "spaces-and-groups",
                            "sidebar-and-group-picker",
                            "spaces-and-groups",
                            "ai-assistant",
                            "ai-active-tabs",
                            "developer-project",
                            "file-manager",
                            "project-terminal",
                          ][index]
                        }`}
                      >
                        See how it works <span aria-hidden="true">›</span>
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <div className="hero-controls">
                <button
                  type="button"
                  data-slide-step="-1"
                  aria-label="Previous workflow"
                >
                  ‹
                </button>
                <div className="hero-tabs" aria-label="Choose a workflow">
                  {[
                    "Everyday",
                    "Focus",
                    "Social",
                    "AI assistant",
                    "AI activity",
                    "Developer",
                    "Files",
                    "Terminal",
                  ].map((label, index) => (
                    <button
                      type="button"
                      data-slide={index}
                      aria-pressed={index === 0}
                      key={label}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  data-slide-step="1"
                  aria-label="Next workflow"
                >
                  ›
                </button>
              </div>
            </div>
            <script src="/assets/showcase.js?v=2" defer />
          </section>
          <section
            className="product-chapter focus-chapter"
            id="highlights"
            aria-labelledby="focus-title"
          >
            <div className="chapter-heading">
              <h2 id="focus-title">
                Separate groups.
                <br />
                Separate logins.
              </h2>
              <p>
                Each tab group can keep its own website logins. Stay signed in to
                work and personal accounts side by side, then switch groups
                without signing out or opening another browser window.
              </p>
              <a
                className="text-link"
                href="/tutorials/spaces-and-groups"
              >
                Explore groups and separate logins <span aria-hidden="true">›</span>
              </a>
            </div>
            <div className="sidebar-demo" aria-label="Compare sidebar layouts">
              <div
                className="sample-switch"
                role="group"
                aria-label="Sidebar layout"
              >
                <button
                  type="button"
                  data-sidebar-view="expanded"
                  aria-pressed="false"
                >
                  Sidebar open
                </button>
                <button
                  type="button"
                  data-sidebar-view="collapsed"
                  aria-pressed="true"
                >
                  Focus view
                </button>
              </div>
              <figure data-sidebar-sample="expanded" hidden>
                <img
                  src="/assets/product/demo/sidebar-expanded.webp?v=8"
                  width="2880"
                  height="1880"
                  alt="Apple’s website in Kudium, with four favorite tiles and five pinned tab groups in the open sidebar"
                  loading="lazy"
                />
                <figcaption>
                  Favorites at the top. Your pinned groups below. A home for
                  every part of your day.
                </figcaption>
              </figure>
              <figure data-sidebar-sample="collapsed">
                <img
                  src="/assets/product/demo/sidebar-collapsed.webp?v=8"
                  width="2880"
                  height="1880"
                  alt="The same Apple page with the sidebar hidden and the Design group switcher in the address bar"
                  loading="lazy"
                />
                <figcaption>
                  The sidebar steps away. Your current group stays right in the
                  address bar.
                </figcaption>
              </figure>
            </div>
            <div className="detail-samples">
              <article>
                <div className="detail-copy">
                  <h3>
                    Switch tab groups.
                    <br />
                    Keep your focus.
                  </h3>
                  <p>
                    Click your group’s name beside the URL. Search or choose
                    another group without opening the sidebar.
                  </p>
                  <a
                    className="text-link"
                    href="/tutorials/sidebar-and-group-picker"
                  >
                    See the steps <span aria-hidden="true">›</span>
                  </a>
                </div>
                <figure className="detail-image picker-image">
                  <img
                    src="/assets/product/address-picker-detail.webp?v=2"
                    width="644"
                    height="708"
                    alt="The open Design group picker beside the URL, with Social, Work, Development, and Reading choices"
                    loading="lazy"
                  />
                </figure>
              </article>
              <article>
                <div className="detail-copy">
                  <h3>
                    Your favourite tools.
                    <br />
                    Always close.
                  </h3>
                  <p>
                    Keep ChatGPT, Perplexity, Gemini, and Translate in Favorites
                    across spaces. Pin work and project groups inside the space
                    where they belong.
                  </p>
                  <a
                    className="text-link"
                    href="/tutorials/favorites-and-pinned-groups"
                  >
                    Make it yours <span aria-hidden="true">›</span>
                  </a>
                </div>
                <figure className="detail-image favorites-image">
                  <img
                    src="/assets/product/favorites-detail.webp?v=1"
                    width="568"
                    height="622"
                    alt="Four favorite tiles for ChatGPT, Perplexity, Gemini and Google Translate above five pinned groups in Kudium’s sidebar"
                    loading="lazy"
                  />
                </figure>
              </article>
            </div>
          </section>
          <section
            className="product-chapter developer-chapter"
            id="developer"
            aria-labelledby="developer-title"
          >
            <div className="chapter-heading">
              <h2 id="developer-title">
                Your project files.
                <br />
                Your browser workspace.
              </h2>
              <p>
                Link a local project to a group. Keep documentation, a live
                preview, source files, and a real terminal in the same
                workspace.
              </p>
              <a className="text-link" href="/tutorials/developer-project">
                Set up your project <span aria-hidden="true">›</span>
              </a>
            </div>
            <figure className="chapter-screen">
              <img
                src="/assets/product/demo/developer-terminal.webp?v=8"
                width="2880"
                height="1880"
                alt="The linked Atlas Studio demo project beside Bun’s website, with real project files and an integrated terminal running a passing Bun test"
                loading="lazy"
              />
              <figcaption>
                Bun on the left. Atlas Studio files and a passing Bun test on
                the right. One workspace.
              </figcaption>
            </figure>
            <div className="developer-details">
              {[
                [
                  "Browse and edit project files.",
                  "Browse folders, filter by filename, and edit and save source in your linked local project.",
                  "file-manager",
                  "Explore files",
                ],
                [
                  "Run commands in the built-in terminal.",
                  "Run commands from your project directory. Open terminal tabs and keep output beside your preview.",
                  "project-terminal",
                  "Open the terminal",
                ],
                [
                  "Save and run project scripts.",
                  "Save project scripts for the work you run often. Give each one a clear name and working directory.",
                  "scripts-and-terminal",
                  "Set up scripts",
                ],
                [
                  "DevTools, website hooks and styles.",
                  "Inspect pages with DevTools. Configure website hooks and styles for the sites you work with.",
                  "devtools-and-config",
                  "Explore developer tools",
                ],
              ].map(([title, description, guide, link]) => (
                <article key={guide}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <a className="text-link" href={`/tutorials/${guide}`}>
                    {link} <span aria-hidden="true">›</span>
                  </a>
                </article>
              ))}
            </div>
            <div className="developer-guide-links">
              <a href="/tutorials/website-hooks">Website hooks ›</a>
              <a href="/tutorials/edit-and-save">Editing &amp; saving ›</a>
            </div>
          </section>
          <section
            className="product-chapter assistant-chapter"
            id="workspace"
            aria-labelledby="assistant-title"
          >
            <div className="chapter-heading">
              <h2 id="assistant-title">AI help for your pages and projects.</h2>
              <p>
                Bring a page or project brief into the conversation. Your
                assistant sits beside the web, with your context close at hand.
              </p>
              <a className="text-link" href="/tutorials/ai-assistant">
                Meet the assistant <span aria-hidden="true">›</span>
              </a>
              <p>
                Follow the count on the AI button, then open Active AI tabs above
                the Assistant input to see which page is active and jump to it.
              </p>
              <a className="text-link" href="/tutorials/ai-active-tabs">
                Track AI tabs <span aria-hidden="true">›</span>
              </a>
            </div>
            <figure className="chapter-screen">
              <img
                src="/assets/product/demo/ai-context.webp?v=8"
                width="2880"
                height="1880"
                alt="Bun’s website beside Kudium’s AI sidebar, with a real project brief attached to a draft planning prompt"
                loading="lazy"
              />
              <figcaption>
                A project brief, a planning prompt, and Bun’s website. Ready for
                your next conversation.
              </figcaption>
            </figure>
          </section>
          <section className="campaign-download" id="download">
            <div className="download-heading">
              <h2>Download Kudium Browser.</h2>
              <p>Your tabs, AI, and projects. Together.</p>
            </div>
            <div className="platform-grid">
              {(["darwin", "win32", "linux"] as const).map((platform, i) => (
                <article key={platform}>
                  <h3>{["macOS", "Windows", "Linux"][i]}</h3>
                  <a
                    className="platform-link"
                    href={`/download/${platform}/arm64`}
                  >
                    {i === 0 ? "Apple silicon" : "ARM64"}
                  </a>
                  <a
                    className="platform-link"
                    href={`/download/${platform}/x64`}
                  >
                    {i === 0 ? "Intel Mac" : "Intel / AMD"}
                  </a>
                </article>
              ))}
            </div>
            <p className="availability">
              Free and open source.{" "}
              <a href="/docs#updates">
                About updates
              </a>
            </p>
          </section>
          <section className="community-section" aria-labelledby="community-title">
            <h2 id="community-title">Made better, together.</h2>
            <p>
              Support the project or help build what comes next.
            </p>
            <div className="community-links">
              <a className="text-link" href={sponsorsUrl}>Sponsor</a>
              <a className="text-link" href={`${githubUrl}/issues`}>Report an issue</a>
              <a className="text-link" href={`${githubUrl}/pulls`}>Contribute</a>
            </div>
          </section>
        </main>
      </Layout>
    )
  );
}
function ReleaseList({
  entries,
  compact = false,
}: {
  entries: ReleaseHistoryEntry[];
  compact?: boolean;
}) {
  const platformName = { darwin: "macOS", win32: "Windows", linux: "Linux" };
  return (
    <div className="release-list">
      {entries.map((release) => (
        <article
          className="release-card"
          key={`${release.channel}/${release.version}`}
        >
          <div className="release-card-heading">
            {compact ? <h3>{release.version}</h3> : <h2>{release.version}</h2>}
            <span
              className={`release-channel release-channel-${release.channel}`}
            >
              {release.channel === "stable" ? "Stable" : "Beta"}
            </span>
            <time dateTime={release.publishedAt}>
              {new Date(release.publishedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                timeZone: "UTC",
              })}
            </time>
          </div>
          <div className="release-notes">
            {release.notes.length ? (
              release.notes.map((note, index) => <p key={index}>{note}</p>)
            ) : (
              <p>No release notes were provided.</p>
            )}
          </div>
          <div className="release-downloads">
            {release.targets.map((target) => (
              <section key={`${target.platform}/${target.arch}`}>
                <h3>
                  {platformName[target.platform]} ·{" "}
                  {target.platform === "darwin"
                    ? target.arch === "arm64"
                      ? "Apple silicon"
                      : "Intel"
                    : target.arch === "arm64"
                    ? "ARM64"
                    : "Intel / AMD"}
                </h3>
                <div>
                  {target.files.map((file) => {
                    const name =
                      new URL(file.url).pathname.split("/").at(-1) ||
                      "Installer";
                    const format = name.toLowerCase().endsWith(".dmg")
                      ? "DMG"
                      : name.toLowerCase().endsWith(".zip")
                      ? "ZIP"
                      : name.toLowerCase().endsWith(".exe")
                      ? "Installer"
                      : name.toLowerCase().endsWith(".appimage")
                      ? "AppImage"
                      : "Download";
                    return (
                      <a
                        key={file.url}
                        href={file.url}
                        aria-label={`Download ${release.version} for ${
                          platformName[target.platform]
                        } ${target.arch}, ${format}`}
                      >
                        {format}
                        <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                      </a>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

export function downloadPage(recentReleases: ReleaseHistoryEntry[] = []) {
  return "<!doctype html>" + renderToStaticMarkup(
    <Layout title="Download" canonicalPath="/download">
      <main className="download-page">
        <div className="download-hero">
        <div className="download-hero-copy">
        <h1>Download Kudium Browser.</h1>
        <p className="download-intro">Free and open source. A little more room for your work.</p>
        <section className="download-recommendation" aria-labelledby="recommended-platform" hidden data-download-recommendation>
          <h2 id="recommended-platform" data-download-title />
          <div className="download-split">
            <a className="download-primary" data-download-primary hidden />
            <details className="download-options" data-download-options>
              <summary aria-label="Choose a download" data-download-trigger>
                <span data-download-trigger-label>Choose a build</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </summary>
              <div className="download-options-list">
                {(["darwin", "win32", "linux"] as const).map((platform, i) => (
                  <div key={platform}>
                    <h3>{["macOS", "Windows", "Linux"][i]}</h3>
                    <a href={`/download/${platform}/arm64`}>{i === 0 ? "Apple silicon" : "ARM64"}</a>
                    <a href={`/download/${platform}/x64`}>{i === 0 ? "Intel Mac" : "Intel / AMD"}</a>
                  </div>
                ))}
              </div>
            </details>
          </div>
        </section>
        </div>
        <figure className="download-app-preview">
          <a href="/assets/product/demo/developer-terminal.webp" aria-label="View the full Kudium Browser screenshot">
            <img src="/assets/product/demo/developer-terminal.webp" width="2880" height="1880" alt="Kudium Browser with organized tab groups, a website, and its integrated file explorer and terminal open side by side" />
          </a>
        </figure>
        </div>
        <section aria-labelledby="all-downloads-title" className="all-downloads">
          <h2 id="all-downloads-title">All downloads</h2>
          <div className="platform-grid">
            {(["darwin", "win32", "linux"] as const).map((platform, i) => (
              <article key={platform}>
                <h3>{["macOS", "Windows", "Linux"][i]}</h3>
                <a className="platform-link" href={`/download/${platform}/arm64`}>{i === 0 ? "Apple silicon" : "ARM64"}</a>
                <a className="platform-link" href={`/download/${platform}/x64`}>{i === 0 ? "Intel Mac" : "Intel / AMD"}</a>
              </article>
            ))}
          </div>
          <p className="availability">Builds are available as releases are published. <a href="/docs#updates">About updates</a></p>
        </section>
        <section className="download-release-history" aria-labelledby="download-history-title">
          <h2 id="download-history-title">Recent releases</h2>
          <p className="download-history-intro">The five most recent published versions, with downloads for each computer.</p>
          {recentReleases.length ? <ReleaseList entries={recentReleases} compact /> : <p className="release-empty">No published versions yet.</p>}
          <a className="text-link" href="/releases">Browse all versions →</a>
        </section>
      </main>
      <script src="/assets/download.js" defer />
    </Layout>
  );
}

export function releaseHistoryPage(history: ReturnType<typeof groupReleaseHistory>, channel: 'all' | 'stable' | 'beta') {
  const pageUrl = (page: number) => `/releases?channel=${channel}&page=${page}`;
  return '<!doctype html>' + renderToStaticMarkup(
    <Layout title="Release history" canonicalPath="/releases">
      <main className="release-history">
        <div className="release-history-heading">
          <p className="release-eyebrow">Kudium Browser</p>
          <h1>Every version, in one place.</h1>
          <p>Browse release notes and download a version for your computer.</p>
          <a className="text-link" href="/download">Get the latest stable version →</a>
        </div>
        <nav className="release-filters" aria-label="Release channel">
          {(['all', 'stable', 'beta'] as const).map(value => <a key={value} href={`/releases?channel=${value}`} aria-current={channel === value ? 'page' : undefined}>{value === 'all' ? 'All versions' : value === 'stable' ? 'Stable' : 'Beta'}</a>)}
        </nav>
        <p className="release-history-help">Beta versions let you try upcoming changes. Before installing an older version, back up your browser data; newer data may not work with it.</p>
        {history.releases.length === 0 ? <section className="release-empty"><h2>{history.total ? 'No versions on this page.' : 'No published versions yet.'}</h2><p>{history.total ? 'Return to the first page to browse available releases.' : 'Downloads will appear here when a release is published.'}</p>{history.total > 0 && <a className="text-link" href={pageUrl(1)}>View releases →</a>}</section> : <ReleaseList entries={history.releases} />}
        {history.releases.length > 0 && history.totalPages > 1 && <nav className="release-pagination" aria-label="Release pages">{history.page > 1 && <a href={pageUrl(history.page - 1)}>← Newer versions</a>}<span>Page {history.page} of {history.totalPages}</span>{history.page < history.totalPages && <a href={pageUrl(history.page + 1)}>Older versions →</a>}</nav>}
      </main>
    </Layout>
  );
}

export function documentation() {
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout docs>
        <main className="docs-layout">
          <aside className="docs-nav">

            <a href="/tutorials">Browser tutorials ↗</a>
            <a href="#overview">Service overview</a>
            <a href="#updates">App updates</a>
            <a href="#sync">Encrypted sync</a>
            <a href="#api">API reference</a>
            <a href="#deployment">Deployment</a>
          </aside>
          <div className="docs-content">
            <section id="overview">

              <h1>
                Kudium service documentation.
              </h1>
              <p className="lead">
                A Bun + Hono service for release distribution, encrypted sync
                records and these React pages.
              </p>
              <div className="callout">
                Desktop account sync uses device approval, an on-device recovery key, and encrypted per-device snapshots. The updated app and backend must both be deployed. Native iCloud sync is a separate integration.
              </div>
            </section>
            <section id="updates">
              <h2>App updates</h2>
              <p>
                Publish a release manifest with a canonical semantic version,
                platform, architecture, channel and HTTPS asset URLs. The server
                selects the highest matching version, so publishing an older
                build never downgrades clients.
              </p>
              <pre>
                <code>
                  {
                    "GET /v1/updates/latest?platform=darwin&arch=arm64&channel=stable&currentVersion=1.0.0"
                  }
                </code>
              </pre>
              <p>
                Use the generic electron-updater feed at{" "}
                <code>/updates/stable/darwin/arm64/latest-mac.yml</code>.
                Windows uses <code>latest.yml</code>; Linux uses{" "}
                <code>latest-linux.yml</code>. Beta uses the equivalent beta
                filenames and channel path. Artifacts and their blockmaps must
                already be uploaded before publication.
              </p>
              <p>
                Set electron-builder’s generic publish URL for each platform and
                architecture. The packaged app-update.yml must point at this
                service. macOS automatic updates require a ZIP and a signed,
                notarized app; Windows requires a signed NSIS installer. The
                database stores metadata, not installers.
              </p>
            </section>
            <section id="sync">
              <h2>Encrypted sync</h2>
              <p>
                Sign in through Better Auth. Browser account pages use HTTP-only
                cookies; desktop sync requests use the signed set-auth-token
                credential as a Bearer token. The service checks the session in
                PostgreSQL and derives ownership from the user ID. No account ID
                is accepted from the client.
              </p>
              <p>
                The envelope matches the desktop AES-256-GCM helper: version,
                recordId, keyVersion, nonce, ciphertext and tag. Nonces and tags
                use canonical base64. Encrypt on the device; never send
                plaintext browsing data or encryption keys.
              </p>
              <div className="callout">
                Storage accepts encrypted envelopes, but cannot verify their
                cryptographic authenticity. Clients must authenticate and
                decrypt incoming records. Desktop sign-in uses Better Auth device authorization. The first device creates a random recovery key; another device must provide it to decrypt data. Account sessions can be revoked from the account page.
              </div>
              <p>
                Create records with <code>If-None-Match: *</code>. Update or
                delete using <code>If-Match: "revision"</code>. Stale revisions
                return 409; missing preconditions return 428. Preserve local
                changes and resolve conflicts before retrying.
              </p>
              <pre>
                <code>{`PUT /v1/sync/records/opaque-record-id
Authorization: Bearer <access-token>
If-None-Match: *
Content-Type: application/json

{
  "version": 1,
  "recordId": "opaque-record-id",
  "keyVersion": 1,
  "nonce": "<12 bytes in base64>",
  "ciphertext": "<encrypted bytes in base64>",
  "tag": "<16 bytes in base64>"
}`}</code>
              </pre>
              <p>
                Read changes in pages, saving the returned account-scoped cursor
                only after applying that page. Deleted records appear as
                tombstones. Remote tabs must remain separate from active local
                tabs; sync must not navigate or close them automatically.
              </p>
            </section>
            <section id="api">
              <h2>API reference</h2>
              <div className="api-table">
                <table>
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Behavior</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["GET /health", "Liveness; GET /ready checks PostgreSQL"],
                      [
                        "GET /v1/updates/latest",
                        "Latest matching release and availability",
                      ],
                      [
                        "GET /v1/sync/status",
                        "Usage, quota and current cursor",
                      ],
                      [
                        "GET /v1/sync/records/:id",
                        "Encrypted envelope and revision ETag",
                      ],
                      [
                        "PUT /v1/sync/records/:id",
                        "Conditional creation or update",
                      ],
                      ["DELETE /v1/sync/records/:id", "Conditional tombstone"],
                      [
                        "GET /v1/sync/changes",
                        "cursor and limit (1–20; default 10)",
                      ],
                      [
                        "DELETE /v1/sync/data",
                        "Erase cloud ciphertext; X-Confirm-Delete: all-sync-data",
                      ],
                    ].map(([route, detail]) => (
                      <tr key={route}>
                        <td>
                          <code>{route}</code>
                        </td>
                        <td>{detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Sync routes require authentication. Each envelope is limited to
                8 MiB of ciphertext; live records have a 64 MiB encoded quota,
                history has a 256 MiB quota, each account can use 10,000 record
                IDs including tombstones, and history is bounded to 100,000
                events. An explicit full-resync and compaction protocol is
                required before those bounds become restrictive. Pages can be
                large; request a smaller limit on constrained devices.
              </p>
              <p>
                Cloud deletion erases current and historical ciphertext and
                preserves opaque tombstones and revision ordering. Backups and
                data already downloaded by devices require separate retention
                and deletion policies.
              </p>
            </section>
            <section id="deployment">
              <h2>Run the service</h2>
              <pre>
                <code>{`cd apps/web
bun install
cp .env.example .env
# Configure PostgreSQL, Better Auth secret/base URL and allowed asset origins.
bun run db:migrate
bun run dev`}</code>
              </pre>
              <p>
                Use PostgreSQL with Drizzle migrations. Terminate HTTPS at your
                reverse proxy. Configure request limits and distributed rate
                limiting at the edge before scaling beyond one process. Run
                migrations as a deployment step, not in every server process.
              </p>
              <p>
                Publish with <code>bun run release:publish manifest.json</code>{" "}
                using a trusted release job with database access. No public
                release administration endpoint is exposed. See the service
                README for the manifest format and deployment details.
              </p>
            </section>
          </div>
        </main>
      </Layout>
    )
  );
}
export function tutorialIndex() {
  const categories = [...new Set(tutorials.map((t) => t.category))];
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout title="Tutorials" canonicalPath="/tutorials">
        <main className="tutorial-hub">
          <div className="tutorial-heading">

            <h1>
              Kudium Browser tutorials.
            </h1>
            <p>
              From your first tab to your next project.
              <br />
              Learn the browser, one useful step at a time.
            </p>
          </div>
          <nav className="tutorial-categories" aria-label="Tutorial categories">
            {categories.map((category) => (
              <a
                key={category}
                href={`#${category.toLowerCase().replaceAll(" ", "-")}`}
              >
                {category}
              </a>
            ))}
          </nav>
          {categories.map((category) => (
            <section
              className="tutorial-category"
              id={category.toLowerCase().replaceAll(" ", "-")}
              key={category}
            >
              <h2>{category}</h2>
              <div className="tutorial-grid">
                {tutorials
                  .filter((t) => t.category === category)
                  .map((t) => (
                    <a
                      className="tutorial-card"
                      key={t.slug}
                      href={`/tutorials/${t.slug}`}
                    >
                      <h3>{t.title}</h3>
                      <p>{t.summary}</p>
                      <span className="text-link">
                        Read the guide <span aria-hidden="true">›</span>
                      </span>
                    </a>
                  ))}
              </div>
            </section>
          ))}
          <div className="tutorial-service">
            <h2>Kudium service documentation</h2>
            <p>
              Read the backend documentation for updates, encrypted sync and
              deployment.
            </p>
            <a className="text-link" href="/docs">
              Service documentation ›
            </a>
          </div>
        </main>
      </Layout>
    )
  );
}
export function tutorialPage(tutorial: Tutorial) {
  const related = tutorials
    .filter((t) => t.category === tutorial.category && t.slug !== tutorial.slug)
    .slice(0, 3);
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout
        title={tutorial.title}
        canonicalPath={`/tutorials/${tutorial.slug}`}
      >
        <main className="tutorial-article">
          <a className="text-link" href="/tutorials">
            ‹ All tutorials
          </a>

          <h1>{tutorial.title}</h1>
          <p className="lead">{tutorial.summary}</p>
          <div className="tutorial-path">
            <p>{tutorial.path}</p>
          </div>
          {tutorial.image && (
            <figure className="tutorial-screen">
              <a
                href={`/assets/product/demo/${tutorial.image}.webp`}
                aria-label="Open full size screenshot"
              >
                <img
                  src={`/assets/product/demo/${tutorial.image}.webp?v=3`}
                  alt={tutorial.imageAlt || `${tutorial.title} in the real Kudium Browser interface with fictional Atlas Studio demo data`}
                  width="1280"
                  height="800"
                />
              </a>
              <figcaption>
                {tutorial.imageCaption || "Real app interface. Fictional Atlas Studio demo data. Click to enlarge."}
              </figcaption>
            </figure>
          )}
          <ol className="tutorial-steps">
            {tutorial.steps.map(([title, detail], i) => (
              <li key={title} id={`step-${i + 1}`}>
                <h2>{title}</h2>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
          {tutorial.note && <div className="callout">{tutorial.note}</div>}
          <div className="tutorial-related">
            <h2>Related browser tutorials</h2>
            {related.map((t) => (
              <a key={t.slug} href={`/tutorials/${t.slug}`}>
                {t.title} <span aria-hidden="true">›</span>
              </a>
            ))}
            <a href="/tutorials">Browse all guides ›</a>
          </div>
        </main>
      </Layout>
    )
  );
}
export function unavailablePage() {
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout>
        <main className="unavailable">

          <h1>
            This download isn’t available yet.
          </h1>
          <p>There’s no release for this platform and architecture yet.</p>
          <a className="button" href="/download">
            Choose another platform →
          </a>
        </main>
      </Layout>
    )
  );
}
export function authPage(
  page: "sign-in" | "sign-up" | "forgot-password" | "reset-password",
  configured: boolean,
  mailEnabled: boolean
) {
  const signup = page === "sign-up",
    reset = page === "reset-password",
    forgot = page === "forgot-password";
  const title = signup
    ? "Create your Kudium account."
    : reset
    ? "Reset your Kudium password."
    : forgot
    ? "Recover your Kudium account."
    : "Sign in to Kudium.";
  const available = configured && (!(forgot || reset) || mailEnabled);
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout privatePage>
        <main className="auth-layout">
          <section className="auth-intro">
            <h1>{title}</h1>
            <p>One account for your browser workspace.</p>
            <p className="auth-note">
              Sign in or create an account, then approve your browser’s connection
              request. Return to Sync in Preferences to set up encrypted sync.
            </p>
          </section>
          <section className="auth-card">
            <h2>
              {signup
                ? "Create an account"
                : reset
                ? "Reset password"
                : forgot
                ? "Password recovery"
                : "Sign in"}
            </h2>
            {available ? (
              <form data-auth-form={page}>
                {signup && (
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={100}
                    />
                  </label>
                )}
                {!reset && (
                  <label>
                    Email address
                    <input
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                    />
                  </label>
                )}
                {!forgot && (
                  <label>
                    {reset ? "New password" : "Password"}
                    <input
                      name="password"
                      type="password"
                      autoComplete={
                        signup || reset ? "new-password" : "current-password"
                      }
                      required
                      minLength={12}
                      maxLength={128}
                    />
                  </label>
                )}
                {signup && (
                  <p className="auth-note">
                    Use at least 12 characters.
                    {mailEnabled
                      ? " Check your inbox to verify your email before signing in."
                      : ""}
                  </p>
                )}
                <button className="button" type="submit">
                  {signup
                    ? "Create account →"
                    : reset
                    ? "Save new password →"
                    : forgot
                    ? "Send reset link →"
                    : "Sign in →"}
                </button>
                <p data-auth-message role="status" aria-live="polite" />
              </form>
            ) : (
              <p role="status">
                {!configured
                  ? "Account service is not configured yet."
                  : "Email recovery is not available yet. Contact hello@kudium.com for help."}
              </p>
            )}
            {signup ? (
              <p>
                Already have an account? <a href="/sign-in">Sign in</a>
              </p>
            ) : (
              <p>
                New to Kudium? <a href="/sign-up">Create an account</a>
              </p>
            )}
            {mailEnabled && !signup && !forgot && !reset && (
              <a className="text-link" href="/forgot-password">
                Forgot your password?
              </a>
            )}
          </section>
        </main>
        <script src="/assets/auth.js" defer />
      </Layout>
    )
  );
}
export function accountPage(
  name: string,
  email: string,
  usage: { usedBytes: number; recordCount: number; quotas: { bytes: number } }
) {
  const capacity = Math.max(0, usage.quotas.bytes);
  const used = Math.max(0, usage.usedBytes);
  const percent = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0;
  const usedLabel = used === 0 ? "0 MB" : used < 1024 * 1024
    ? `${(used / 1024).toFixed(1)} KB` : `${(used / 1024 / 1024).toFixed(1)} MB`;
  const capacityLabel = `${(capacity / 1024 / 1024).toLocaleString()} MB`;
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout privatePage title="Account">
        <main className="account-dashboard">
          <div className="account-heading">
            <div>
              <p className="account-eyebrow">Account</p>
              <h1>{name ? `Hello, ${name}.` : "Your account."}</h1>
              <p className="account-email">{email}</p>
            </div>
            <button className="account-button" type="button" data-sign-out>Sign out</button>
          </div>
          <p className="account-status" data-auth-message role="status" aria-live="polite" />
          <div className="account-grid">
            <div className="account-summary">
              <section className="account-panel" aria-labelledby="storage-heading">
                <div className="account-section-heading">
                  <h2 id="storage-heading">Sync storage</h2>
                  <span className="account-badge">Encrypted</span>
                </div>
                <div className="account-storage-value"><strong>{usedLabel}</strong><span>of {capacityLabel} used</span></div>
                <div className="account-storage-track" role="meter" aria-label="Sync storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${usedLabel} of ${capacityLabel} used`}>
                  <span style={{ width: `${percent}%` }} />
                </div>
                <div className="account-storage-details">
                  <span>{percent === 0 ? "0" : percent < 1 ? "<1" : Math.round(percent)}% used</span>
                  <span title="Includes records marked as deleted.">{usage.recordCount.toLocaleString()} stored {usage.recordCount === 1 ? "record" : "records"}</span>
                </div>
                <p className="account-caption">Your browsing data is encrypted before it leaves your device.</p>
                <a className="account-text-link" href="/docs#sync">About encrypted sync <span aria-hidden="true">↗</span></a>
              </section>
              <aside className="account-sync-note">
                <span className="account-note-icon" aria-hidden="true">↔</span>
                <div><h2>Bring your devices together.</h2><p>Open Preferences → Sync in Kudium Browser to connect a device. Keep your recovery key somewhere safe.</p></div>
              </aside>
            </div>
            <section className="account-panel account-devices" aria-labelledby="devices-heading">
              <div className="account-section-heading"><h2 id="devices-heading">Devices &amp; sessions</h2><span className="account-device-count" data-account-session-count /></div>
              <p className="account-section-description">Manage where you're signed in.</p>
              <div className="account-session-list" data-account-sessions aria-busy="true"><p className="account-session-status" role="status">Loading your devices…</p></div>
              <p className="account-device-footnote">Signing out a device stops future sync access. Data already on that device stays there.</p>
            </section>
          </div>
        </main>
        <script src="/assets/auth.js" defer />
        <script src="/assets/sessions.js?v=2" defer />
      </Layout>
    )
  );
}

export function devicePage() {
  return renderToStaticMarkup(
    <Layout title="Connect Kudium Browser" privatePage>
      <main className="device-layout">
        <section className="auth-card device-card" aria-labelledby="device-title">
          <div className="device-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="5" width="24" height="17" rx="3" stroke="currentColor" strokeWidth="1.7" />
              <path d="M11 27h10M16 22v5M5 10h22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <p className="eyebrow">Kudium Browser</p>
          <h1 id="device-title">Connect your browser.</h1>
          <p className="device-description">Compare this code with the one in your browser’s Preferences. Approve only a request you started.</p>
          <div className="device-code-panel">
            <span>Verification code</span>
            <strong data-device-code aria-label="Verification code">—</strong>
          </div>
          <div className="device-actions">
            <button className="button" data-device-approve disabled>Approve this device</button>
            <button className="button button-secondary" data-device-deny disabled>Cancel</button>
          </div>
          <p data-device-message role="status" aria-live="polite">Checking request…</p>
          <p className="device-footnote">This signs the browser into your account. Sync starts after you set up your encryption key and choose what to sync in the app.</p>
        </section>
      </main>
      <script src="/assets/device.js" defer />
    </Layout>
  );
}
