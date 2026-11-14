import { Theme } from "@radix-ui/themes";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { serviceOrigin } from "./config";
import { tutorials, type Tutorial } from "./tutorials";
import { whatsNew } from "./whats-new";
import type { groupReleaseHistory, ReleaseHistoryEntry } from "./releases";
const radixStylesheetVersion = createHash("sha256").update(readFileSync(new URL("../node_modules/@radix-ui/themes/styles.css", import.meta.url))).digest("hex").slice(0, 12);
const stylesheetVersion = createHash("sha256").update(readFileSync(new URL("../public/site.css", import.meta.url))).digest("hex").slice(0, 12);
const accountDataVersion = createHash("sha256").update(readFileSync(new URL("../public/account-data.js", import.meta.url))).digest("hex").slice(0, 12);
const authScriptVersion = createHash("sha256").update(readFileSync(new URL("../public/auth.js", import.meta.url))).digest("hex").slice(0, 12);
const passkeyScriptVersion = createHash("sha256").update(readFileSync(new URL("../public/passkeys.ts", import.meta.url))).digest("hex").slice(0, 12);
const uiStylesheetVersion = createHash("sha256").update(readFileSync(new URL("../public/ui.css", import.meta.url))).digest("hex").slice(0, 12);
const githubUrl = "https://github.com/kudium/web-browser";
const sponsorsUrl = "https://github.com/sponsors/kudium";
export function Layout({
  children,
  docs = false,
  privatePage = false,
  title,
  canonicalPath,
  stylesheet,
}: {
  children: ReactNode;
  docs?: boolean;
  privatePage?: boolean;
  title?: string;
  canonicalPath?: string;
  stylesheet?: string;
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
        <link rel="stylesheet" href={`/assets/site.css?v=${stylesheetVersion}`} />
        {stylesheet && <link rel="stylesheet" href={stylesheet} />}
        <link rel="stylesheet" href={`/assets/radix-themes.css?v=${radixStylesheetVersion}`} />
        <link rel="stylesheet" href={`/assets/ui.css?v=${uiStylesheetVersion}`} />
      </head>
      <Theme asChild appearance="light" accentColor="teal" grayColor="gray" radius="large" panelBackground="solid" scaling="100%">
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
            <a href="/hooks">Hooks</a>
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
          <a href="/privacy" className="privacy-link">Privacy</a>
          <a href="/releases">Release history</a>
          <a href="/whats-new">What’s New</a>
          <a href={githubUrl}>GitHub</a>
          <a href={sponsorsUrl}>Support Kudium</a>
        </footer>
        {!privatePage && canonicalPath !== "/whats-new" && (
          <>
          <a className="whats-new-fab" href="/whats-new">
            <span className="whats-new-fab-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7M12 7v5l3 2" />
              </svg>
            </span>
            <span>What’s new</span>
          </a>
          <script src="/assets/whats-new-fab.js?v=1" defer />
          </>
        )}
      </body>
      </Theme>
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
                    "A space for every part of your day.",
                    "Keep everyday sites in groups, gather related groups into collections, and choose a folder or stack view. Your favorites stay within reach.",
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
                    "ai-glassy",
                    "Make the AI panel your own.",
                    "Choose a solid AI panel for everyday reading, or turn on Glassy AI panel in Preferences → Appearance for softer, translucent surfaces. Glassy AI panel is off by default.",
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
                    aria-label={`${index + 1} of 9`}
                  >
                    <div className="hero-screen">
                      <img
                        src={`/assets/product/demo/${image}.webp?v=11`}
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
                    "Appearance",
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
                Organise related groups in collections. Use folders to browse tabs
                or stacks for a compact view. Groups can share a collection’s
                login session, or keep separate logins for work and personal accounts.
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
                  src="/assets/product/demo/sidebar-expanded.webp?v=11"
                  width="2880"
                  height="1880"
                  alt="Apple’s website in Kudium, with favorite tiles, Product Studio and Engineering collections, and folder and stack groups"
                  loading="lazy"
                />
                <figcaption>
                  Favorites at the top. Collections, folders and stacks below.
                  A clear home for your work and everyday browsing.
                </figcaption>
              </figure>
              <figure data-sidebar-sample="collapsed">
                <img
                  src="/assets/product/demo/sidebar-collapsed.webp?v=11"
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
                src="/assets/product/demo/developer-terminal.webp?v=11"
                width="2880"
                height="1880"
                alt="The linked Atlas Studio demo project beside its local collection overview, with real project files and an integrated terminal running a passing Bun test"
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
                Type @ to reference a group or page, or / to choose a skill.
                Suggestions appear beside the line you’re typing.
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
                src="/assets/product/demo/ai-mentions.webp?v=11"
                width="2880"
                height="1880"
                alt="The Atlas Studio collection overview beside Kudium’s AI sidebar, with an attached project brief and group suggestions directly beneath the draft’s typing line"
                loading="lazy"
              />
              <figcaption>
                An attached brief and group suggestions beside your draft.
                Keep the page and the right context close at hand.
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
    <ul className="release-list">
      {entries.map((release) => {
        const notes = release.notes.filter(
          (note) => note.trim() !== `Kudium Browser ${release.version}`
        );
        return (
          <li
            className="release-row"
            key={`${release.channel}/${release.version}`}
          >
            <div className="release-row-heading">
              {compact ? (
                <h3>{release.version}</h3>
              ) : (
                <h2>{release.version}</h2>
              )}
              <span className="release-channel">
                {release.channel === "stable" ? "Stable" : "Beta"}
              </span>
              <time dateTime={release.publishedAt}>
                {new Date(release.publishedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </time>
            </div>
            <div className="release-downloads">
              {release.targets.map((target) => (
                <div key={`${target.platform}/${target.arch}`}>
                  <span className="release-target-label">
                    {platformName[target.platform]}{" "}
                    {target.platform === "darwin"
                      ? target.arch === "arm64"
                        ? "Apple silicon"
                        : "Intel"
                      : target.arch === "arm64"
                      ? "ARM64"
                      : "Intel / AMD"}
                  </span>
                  {target.files.map((file) => {
                    const name =
                      new URL(file.url).pathname
                        .split("/")
                        .at(-1)
                        ?.toLowerCase() || "";
                    const format = name.endsWith(".dmg")
                      ? "DMG"
                      : name.endsWith(".zip")
                      ? "ZIP"
                      : name.endsWith(".exe")
                      ? "Installer"
                      : name.endsWith(".appimage")
                      ? "AppImage"
                      : "Download";
                    return (
                      <a
                        key={file.url}
                        href={file.url}
                        title={`${(file.size / 1024 / 1024).toFixed(1)} MB`}
                        aria-label={`Download ${release.version} for ${
                          platformName[target.platform]
                        } ${target.arch}, ${format}`}
                      >
                        {format}
                      </a>
                    );
                  })}
                </div>
              ))}
            </div>
            {notes.length > 0 && (
              <details className="release-notes">
                <summary>Release notes</summary>
                {notes.map((note, index) => (
                  <p key={index}>{note}</p>
                ))}
              </details>
            )}
          </li>
        );
      })}
    </ul>
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
          <h1>Releases</h1>
          <p>Download current and older versions.</p>
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
            <a href="/docs/notes-and-activity">Notes and Activity API</a>
            <a href="/tutorials/website-hooks#context-and-api">Hook actions: context and api</a>
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
                use canonical base64. The envelope API stores ciphertext.
                Account-managed sync provisions account keys separately and
                decrypts data for the authenticated dashboard.
              </p>
              <div className="callout">
                Storage accepts encrypted envelopes, but cannot verify their
                cryptographic authenticity. Clients must authenticate and
                decrypt incoming records. Desktop sign-in uses Better Auth device authorization. A configured account-managed sync service makes data available after sign-in; legacy recovery-key backups require a one-time migration. Account sessions can be revoked from the account page.
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
                  src={`/assets/product/demo/${tutorial.image}.webp?v=11`}
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
          {tutorial.sections?.map((section) => (
            <section className="tutorial-reference-section" key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.reference && (
                <div className="tutorial-reference-table">
                  <table aria-label={section.title}>
                    <thead><tr><th scope="col">Property or method</th><th scope="col">What it does</th></tr></thead>
                    <tbody>{section.reference.map(([name, detail]) => (
                      <tr key={name}><th scope="row"><code>{name}</code></th><td>{detail}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {section.examples?.map((example) => (
                <div key={example.title}>
                  <h3>{example.title}</h3>
                  <pre><code>{example.code}</code></pre>
                </div>
              ))}
            </section>
          ))}
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
  mailEnabled: boolean,
  googleEnabled = false
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
              Sign in to publish hooks, join discussions, or approve your browser’s connection
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
              <><div className="auth-alternatives">
                {!forgot && !reset && googleEnabled && <button type="button" className="account-button auth-provider" data-google-sign-in><svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.9h11a9.4 9.4 0 0 1-4.1 6.2v5.2h6.7c3.9-3.6 6-8.8 6-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-4.3l-6.7-5.2c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.7v5.3A20.5 20.5 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 28a12.3 12.3 0 0 1 0-8V14.7H5.7a20 20 0 0 0 0 18.6Z"/><path fill="#EA4335" d="M24 11.6c3 0 5.6 1 7.7 3l5.8-5.8A19.3 19.3 0 0 0 24 4 20.5 20.5 0 0 0 5.7 14.7l6.9 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg> Continue with Google</button>}
                {!forgot && !reset && <button type="button" className="account-button auth-provider" data-passkey-sign-in>Sign in with a passkey</button>}
                {!forgot && !reset && <p className="auth-divider">or continue with email</p>}
              </div><form data-auth-form={page}>
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
                      autoComplete={signup ? "email" : "username webauthn"}
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
              </form></>
            ) : (
              <p role="status">
                {!configured
                  ? "Account service is not configured yet."
                  : "Email recovery is not available yet. Contact hello@kudium.com for help."}
              </p>
            )}
            {!forgot && !reset && <p className="auth-privacy">Read how we handle your data in our <a href="/privacy">Privacy Policy</a>.</p>}
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
        <script src={`/assets/auth.js?v=${authScriptVersion}`} defer />
        <script src={`/assets/passkeys.js?v=${passkeyScriptVersion}`} type="module" />
      </Layout>
    )
  );
}
export function accountPage(
  name: string,
  email: string,
  usage: { usedBytes: number; recordCount: number; quotas: { bytes: number } }
) {
  const displayName = name.trim();
  const showName = displayName && displayName.toLowerCase() !== email.trim().toLowerCase();
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
            <div className="account-heading-identity">
              <h1>Your workspace</h1>
              <p className="account-email">
                {showName && <><span>{displayName}</span><span aria-hidden="true"> · </span></>}
                {email}
              </p>
            </div>
            <div className="account-heading-actions">
              <a className="account-button" href="/account/hooks">My hooks</a>
              <a className="account-button account-publish-button" href="/hooks/new">Publish hook</a>
              <button className="account-button account-sign-out" type="button" data-sign-out>Sign out</button>
            </div>
          </div>
          <p className="account-status" data-auth-message role="status" aria-live="polite" />
          <section className="cloud-workspace" data-account-data aria-label="Your synced data">
            <aside className="cloud-sidebar">
              <div className="cloud-sidebar-heading">Your workspace</div>
              <label className="cloud-mobile-navigation"><span className="cloud-app-icon cloud-icon-notes" data-workspace-icon aria-hidden="true">≡</span><span className="sr-only">Workspace view</span><select data-workspace-navigation aria-label="Workspace view"><option value="notes">Notes</option><option value="workspace">Apps &amp; tabs</option><option value="hooks">Page hooks</option><option value="storage">Storage</option><option value="devices">Devices &amp; sessions</option></select></label>
              <nav className="cloud-navigation" aria-label="Workspace collections">
                <button type="button" data-data-category="notes" aria-current="page"><span className="cloud-app-icon cloud-icon-notes" aria-hidden="true">≡</span>Notes<span data-data-count="notes" /></button>
                <button type="button" data-data-category="workspace"><span className="cloud-app-icon cloud-icon-tabs" aria-hidden="true">▣</span>Apps &amp; tabs<span data-data-count="workspace" /></button>
                <button type="button" data-data-category="hooks"><span className="cloud-app-icon cloud-icon-hooks" aria-hidden="true">⌘</span>Page hooks<span data-data-count="hooks" /></button>
                <button className="cloud-menu-settings" type="button" data-data-category="storage" aria-controls="cloud-storage"><span className="cloud-app-icon cloud-icon-settings" aria-hidden="true">▤</span>Storage</button>
                <button type="button" data-data-category="devices" aria-controls="cloud-devices"><span className="cloud-app-icon cloud-icon-settings" aria-hidden="true">▱</span>Devices</button>
              </nav>
              <div className="cloud-sidebar-bottom"><span className="cloud-secure-dot" aria-hidden="true" />Encrypted storage<a href="/docs#sync">How sync works ↗</a></div>
            </aside>
            <div className="cloud-content">
              <div className="cloud-toolbar">
                <div><h2 data-data-heading>Notes</h2><p data-data-subtitle>Your ideas, always within reach.</p></div>
                <button className="account-button cloud-refresh" type="button" data-data-refresh aria-label="Refresh synced data">↻<span>Refresh</span></button>
              </div>
              <div className="cloud-filters">
                <label className="cloud-search"><span aria-hidden="true">⌕</span><input type="search" data-data-search placeholder="Search notes" aria-label="Search notes" maxLength={256} /></label>
                <label className="cloud-source-filter"><span className="sr-only">Backup source</span><select data-data-source aria-label="Backup source"><option value="all">All devices</option></select></label>
              </div>
              <p className="cloud-status" data-data-status role="status" aria-live="polite">Loading your synced data…</p>
              <form data-data-recovery hidden className="account-data-recovery">
                <div><strong>Connect your existing backups</strong><p>Enter your recovery key once. Future sign-ins will give you access automatically.</p></div>
                <label>Recovery key<input type="password" autoComplete="off" required maxLength={64} /></label>
                <button className="account-button cloud-primary" type="submit">Connect backups</button>
              </form>
              <div className="cloud-browser">
                <div className="cloud-list" data-data-list aria-label="Items" aria-busy="true" />
                <section className="cloud-detail" data-data-detail aria-label="Item preview" tabIndex={-1}><div className="cloud-empty"><span className="cloud-empty-icon" aria-hidden="true">≡</span><h3>Your workspace is loading</h3><p>Your saved notes and browser data will appear here.</p></div></section>
              </div>

            <section id="cloud-storage" data-workspace-panel="storage" hidden className="cloud-settings-panel account-storage" aria-labelledby="storage-heading">
              <div className="account-section-heading"><h2 id="storage-heading">Cloud storage</h2><span className="account-badge">Encrypted</span></div>
              <div className="account-storage-value"><strong>{usedLabel}</strong><span>of {capacityLabel} used</span></div>
              <div className="account-storage-track" role="meter" aria-label="Sync storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${usedLabel} of ${capacityLabel} used`}><span style={{ width: `${percent}%` }} /></div>
              <div className="account-storage-details"><span>{percent === 0 ? "0" : percent < 1 ? "<1" : Math.round(percent)}% used</span><span title="Includes records marked as deleted.">{usage.recordCount.toLocaleString()} stored {usage.recordCount === 1 ? "record" : "records"}</span></div>
              <p className="account-caption cloud-storage-explanation">Encrypted in transit and at rest. Your account gives you access across devices.</p>
              <p className="cloud-storage-timestamp">Usage when this page was opened. Reload the page for the latest total.</p>
              <a className="account-text-link" href="/docs#sync">Connect another device <span aria-hidden="true">↗</span></a>
            </section>
            <section id="cloud-devices" data-workspace-panel="devices" hidden className="cloud-settings-panel account-devices" aria-labelledby="devices-heading">
              <div className="account-section-heading"><h2 id="devices-heading">Signed-in devices</h2><span className="account-device-count" data-account-session-count /></div>
              <p className="account-section-description">Manage where you're signed in.</p>
              <div className="account-session-list" data-account-sessions aria-busy="true"><p className="account-session-status" role="status">Loading your devices…</p></div>
              <div className="account-sign-in-methods" data-sign-in-methods>
                <div className="account-section-heading"><h2>Sign-in methods</h2></div>
                <p className="account-section-description">Use a passkey to sign in with Touch ID, Face ID, or your device screen lock.</p>
                <div className="account-session-list" data-passkey-list aria-busy="true" />
                <div className="passkey-create"><label>Passkey name<input data-passkey-name maxLength={100} placeholder="e.g. My Mac" autoComplete="off" /></label><button type="button" className="account-button" data-passkey-add>Create a passkey</button></div>
                <p data-passkey-message role="status" aria-live="polite" />
                <div data-google-link-section hidden><button type="button" className="account-button" data-google-link>Connect Google</button><p className="account-caption">Use the same email as your Kudium account.</p></div>
              </div>
              <p className="account-device-footnote">Signing out a device stops future sync access. Data already on that device stays there.</p>
            </section>

              <div className="cloud-workspace-footnote">Changes here update a device’s cloud backup. Restore in Kudium Browser → Preferences → Sync to use them on your desktop.</div>
            </div>
          </section>

        </main>
        <script src={`/assets/auth.js?v=${authScriptVersion}`} defer />
        <script src={`/assets/passkeys.js?v=${passkeyScriptVersion}`} type="module" />
        <script src="/assets/sessions.js?v=2" defer />
        <script src={`/assets/account-data.js?v=${accountDataVersion}`} defer />
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


export function notesAndActivityDocumentation() {
  return "<!doctype html>" + renderToStaticMarkup(
    <Layout docs title="Notes and Activity API" canonicalPath="/docs/notes-and-activity">
      <main className="docs-layout">
        <aside className="docs-nav">
          <a href="/docs">Service documentation</a>
          <a href="#hook-api">Hook API</a>
          <a href="#monitoring">Monitor a page</a>
          <a href="#ai-tools">AI tools</a>
          <a href="#links">Links and unread state</a>
          <a href="#limits">Limits and permissions</a>
          <a href="/tutorials/website-hooks">Website hooks tutorial ↗</a>
          <a href="/tutorials/website-hooks#context-and-api">Context menu action API ↗</a>
        </aside>
        <div className="docs-content">
          <section id="overview">
            <h1>Notes and Activity API</h1>
            <p className="lead">Save research findings in a note, record browser events, and draw attention to meaningful page updates.</p>
            <div className="callout">These APIs run inside Kudium Browser. They are local hook APIs and AI tools, not HTTP endpoints on this website. They require a desktop version containing Notes and Activity support.</div>
            <p>Notes holds saved Markdown content. Activity has its own dedicated assistant page and toolbar button, with events, timestamps, unread badges, and actions to open a note or website.</p>
          </section>
          <section id="hook-api">
            <h2>Page lifecycle hook API</h2>
            <p>Use these asynchronous methods in Before load or After load website scripts. The browser assigns the source and group scope.</p>
            <p>For the Actions tab, <code>context</code> contains page data and <code>api</code> performs actions. Use <code>api.notes.create</code> and <code>api.activity.create</code> there; commands apply after the handler finishes and do not return IDs. See the <a href="/tutorials/website-hooks#context-and-api">context menu action guide and examples</a>.</p>
            <h3>Create an Activity alert</h3>
            <pre><code>{`const event = await context.activity.create({
  title: 'Price changed',
  message: 'The listed price is now $20.',
  url: context.url,
});
// event.id, event.deepLink`}</code></pre>
            <p><code>title</code> is required. <code>message</code> and <code>url</code> are optional; the URL defaults to the current page. An explicit Activity alert starts unread.</p>
            <h3>Create a note</h3>
            <pre><code>{`const saved = await context.notes.create({
  title: 'Research verdict',
  body: '# Verdict\n\nThe updated page lists the price as **$20**.',
});
// saved.recordId, saved.deepLink, saved.activityId`}</code></pre>
            <p>Both <code>title</code> and <code>body</code> are required. The body supports Markdown. Creating a note also creates an unread Activity with an Open note action, so do not add a duplicate alert for the same result. Hook-created notes have AI access off.</p>
            <p>If a note saves but its Activity cannot be written, the note remains saved and the result includes a warning. Hooks can create notes and activities; they cannot read, edit, delete, or link arbitrary existing notes. Approved external webhook delivery remains available separately through <code>context.notify(key, text)</code>.</p>
          </section>
          <section id="monitoring">
            <h2>Monitor a page</h2>
            <p>Compare the relevant value and debounce changes before creating an output. Adapt the selector to the inspected page. This example records a note only when the displayed price changes.</p>
            <pre><code>{`let previous = document.querySelector('[data-price]')?.textContent?.trim();
let timer;
new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const next = document.querySelector('[data-price]')?.textContent?.trim();
    if (!next || next === previous) return;
    previous = next;
    try {
      await context.notes.create({
        title: 'Price changed',
        body: 'The price changed to **' + next + '**.',
      });
    } catch (error) {
      context.log(String(error));
    }
  }, 1000);
}).observe(document.body, {
  childList: true, subtree: true, characterData: true,
});`}</code></pre>
            <p>Hooks run while the page is loaded. This example initializes its comparison on each load; it is not a background scheduler or persistent cross-session change detector.</p>
            <p>You can ask the assistant: “Inspect this page and create a hook that records price changes in a note.” The assistant should inspect the page, preserve existing hooks, use <code>read_site_hooks</code> and <code>configure_site_hooks</code>, and verify the saved configuration. Hook source changes require native review; reload the page when starting the approved monitor.</p>
          </section>
          <section id="ai-tools">
            <h2>AI tools</h2>
            <p>These tool names and parameters belong to the browser assistant and its external AI integration. They are not methods on the hook context.</p>
            <h3>manage_note</h3>
            <pre><code>{`{
  "noteAction": "create",
  "title": "Research verdict",
  "noteBody": "# Verdict\n\nFindings and supporting links.",
  "destination": "group"
}`}</code></pre>
            <p><code>noteAction</code> accepts <code>create</code>, <code>update</code>, or <code>delete</code>. Creation requires <code>title</code> and <code>noteBody</code>; <code>destination</code> defaults to <code>group</code> and can be <code>browser</code> on creation. Update and delete require <code>recordId</code>; updates can supply a new title and/or body. Optional <code>tabId</code> selects the applicable tab scope.</p>
            <p>Use <code>search_personal_data</code> and <code>read_personal_data</code> to find and read permitted notes. Existing notes require AI access; sensitive notes require authentication. AI-created notes enable AI access. Creating or updating a note marks it unread and automatically creates a linked unread Activity. Deleting a note returns its ID and deletion status.</p>
            <h3>create_activity</h3>
            <pre><code>{`{
  "title": "Research complete",
  "activityMessage": "The updated report is available.",
  "url": "https://example.com/report"
}`}</code></pre>
            <p><code>title</code> is required. Optional fields are <code>activityMessage</code>, <code>url</code>, <code>recordId</code> (a note in scope), and <code>tabId</code>. The result includes an Activity <code>deepLink</code>. Use this for other requested alerts or task outcomes; <code>manage_note</code> already creates an Activity for saved notes.</p>
          </section>
          <section id="links">
            <h2>Links and unread state</h2>
            <pre><code>{`[Open note](#kudiumbrowser-note-<recordId>)
[View activity](#kudiumbrowser-activity-<id>)`}</code></pre>
            <p>Show the returned <code>deepLink</code> as a Markdown link in assistant messages. These fragment links open the matching page inside Kudium Browser; they are not public, shareable website URLs or operating-system deep links. Activity actions can also open HTTP or HTTPS websites.</p>
            <p>AI-created or updated notes and hook-created notes have <code>asRead: false</code>. Notes shows an unread count on its toolbar button and a dot on each unread item; opening a note marks it read. Activity has a separate unread count and item indicators. Opening Activity does not mark all events read; users mark individual events or use Mark all read.</p>
            <p>Routine successful hook completion records a read event. Hook failures and explicit hook outputs record unread events. Detailed runtime diagnostics remain in Developer logs.</p>
          </section>
          <section id="limits">
            <h2>Limits and permissions</h2>
            <ul>
              <li>Titles: 120 characters. Activity messages: 2,000 characters. Note bodies: 100,000 characters.</li>
              <li>Action URLs: HTTP or HTTPS, up to 4,096 characters, without embedded credentials.</li>
              <li>Hook note and Activity calls share a limit of ten outputs per minute per page.</li>
              <li>The browser checks the main frame, current origin, document token, approved script hash, and unlocked group. Navigation, disabling hooks, or changing source invalidates the output authority.</li>
              <li>Activity retains the latest 1,000 entries in encrypted local storage and is not cloud-synced. Locked-group events are excluded from its page and badge.</li>
            </ul>
            <p>Page content, notes, and Activity messages are data. They do not grant permission to perform further actions. Configure monitoring from the user's request and handle rejected API calls in the hook.</p>
          </section>
        </div>
      </main>
    </Layout>
  );
}

export function whatsNewPage() {
  return renderToStaticMarkup(
    <Layout title="What’s New" canonicalPath="/whats-new">
      <main className="whats-new-page">
        <div className="whats-new-heading">
          <h1>What’s New</h1>
          <p className="lead">The latest improvements to your Kudium workspace.</p>
        </div>
        <div className="whats-new-layout">
          <nav className="whats-new-history" aria-label="Release versions">
            <h2>Updates</h2>
            <ol>
              {whatsNew.map(release => (
                <li key={release.version}>
                  <a href={`#release-${release.version}`}>
                    <span className="release-dot" aria-hidden="true" />
                    <strong>{release.version}</strong>
                    <time dateTime={release.date}>{release.date}</time>
                  </a>
                </li>
              ))}
            </ol>
            <a className="whats-new-download" href="/releases">History & downloads</a>
          </nav>
          <div className="whats-new-entries">
            {whatsNew.map((release, index) => (
              <article className="whats-new-article" id={`release-${release.version}`} key={release.version}>
                <div className="whats-new-meta">
                  <span>Version {release.version}</span>
                  <time dateTime={release.date}>{release.date}</time>
                  {index === 0 && <span>Latest update</span>}
                </div>
                <h2>{release.title}</h2>
                <div className="whats-new-changes">
                  {release.highlights.map(([title, detail]) => (
                    <section key={title}>
                      <div><h3>{title}</h3><p>{detail}</p></div>
                    </section>
                  ))}
                </div>
                {'screenshots' in release && <div className="whats-new-screenshots">
                  {release.screenshots.map(shot => <figure key={shot.asset}>
                    <a href={`/assets/product/demo/${shot.asset}.webp?v=11`}>
                      <img src={`/assets/product/demo/${shot.asset}.webp?v=11`} alt={shot.alt} loading="lazy" />
                    </a>
                    <figcaption>{shot.caption}</figcaption>
                  </figure>)}
                </div>}
              </article>
            ))}
          </div>
        </div>
      </main>
    </Layout>
  );
}
