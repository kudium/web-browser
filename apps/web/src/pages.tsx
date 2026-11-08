import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { serviceOrigin } from "./config";
import { tutorials, type Tutorial } from "./tutorials";
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
        <link rel="stylesheet" href="/assets/site.css?v=12" />
      </head>
      <body>
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
            <a className="nav-button" href="/#download">
              Get Browser
            </a>
          </nav>
        </header>
        {children}
        <footer>
          <a className="brand" href="/">
            Kudium
          </a>
          <span>A little more room for you.</span>
          <a href="/tutorials">Tutorials</a>
          <a href="/docs">Documentation</a>
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
              <a className="button" href="#download">
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
                    "Your day. Beautifully organised.",
                    "Social, work, design, development, and reading. Five groups, twenty everyday tabs, and your favorite tools within reach.",
                  ],
                  [
                    "sidebar-collapsed",
                    "More room for the web.",
                    "Hide the sidebar. Your Design group stays in the address bar, ready to switch whenever you need it.",
                  ],
                  [
                    "social-workspace",
                    "Your favourite corners of the internet.",
                    "YouTube, Reddit, Instagram, and LinkedIn. Keep your social tabs together, with a separate home for work.",
                  ],
                  [
                    "ai-context",
                    "A little help. Right where you work.",
                    "Keep your page in view while you bring a project brief into the AI sidebar and plan your next move.",
                  ],
                  [
                    "developer-workspace",
                    "From browsing to building.",
                    "Link a local project to your development group. Keep its files and tools beside the web.",
                  ],
                  [
                    "developer-files",
                    "Your project, within reach.",
                    "Browse folders, filter files, and edit source without losing your place.",
                  ],
                  [
                    "developer-terminal",
                    "Less switching. More shipping.",
                    "Run commands and check your project in the built-in terminal. This is a real test run.",
                  ],
                ].map(([image, title, description], index) => (
                  <figure
                    className="hero-slide"
                    id={`workflow-${index}`}
                    key={image}
                    aria-label={`${index + 1} of 7`}
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
            <p className="hero-platforms">
              Available for macOS, Windows, and Linux.
              <br />
              <span>Downloads open as builds are published.</span>
            </p>
          </section>
          <section
            className="product-chapter focus-chapter"
            id="highlights"
            aria-labelledby="focus-title"
          >
            <div className="chapter-heading">
              <h2 id="focus-title">
                Your tabs, together.
                <br />
                Your page, wide open.
              </h2>
              <p>
                Give work, socials, and side projects their own groups. Hide the
                sidebar when it’s time to focus. Everything stays a click away.
              </p>
              <a
                className="text-link"
                href="/tutorials/sidebar-and-group-picker"
              >
                Explore focused browsing <span aria-hidden="true">›</span>
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
                    Change context.
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
                    Your daily essentials.
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
                Your browser.
                <br />
                And your next build.
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
                  "Files that stay in context.",
                  "Browse folders, filter by filename, and edit and save source in your linked local project.",
                  "file-manager",
                  "Explore files",
                ],
                [
                  "A terminal that belongs here.",
                  "Run commands from your project directory. Open terminal tabs and keep output beside your preview.",
                  "project-terminal",
                  "Open the terminal",
                ],
                [
                  "Your repeatable commands.",
                  "Save project scripts for the work you run often. Give each one a clear name and working directory.",
                  "scripts-and-terminal",
                  "Set up scripts",
                ],
                [
                  "Tools for the page itself.",
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
              <h2 id="assistant-title">Stay with the idea.</h2>
              <p>
                Bring a page or project brief into the conversation. Your
                assistant sits beside the web, with your context close at hand.
              </p>
              <a className="text-link" href="/tutorials/ai-assistant">
                Meet the assistant <span aria-hidden="true">›</span>
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
              <img
                src="/assets/product/origin-logo.png"
                width="42"
                height="46"
                alt=""
                loading="lazy"
              />
              <h2>Find your new space.</h2>
              <p>One browser. A world of possibilities.</p>
            </div>
            <div className="platform-grid">
              {(["darwin", "win32", "linux"] as const).map((platform, i) => (
                <article key={platform}>
                  <h3>{["macOS", "Windows", "Linux"][i]}</h3>
                  <p>
                    {
                      [
                        "For Apple silicon and Intel.",
                        "For ARM and Intel / AMD.",
                        "For ARM and Intel / AMD.",
                      ][i]
                    }
                  </p>
                  <a
                    className="platform-link"
                    href={`/download/${platform}/arm64`}
                  >
                    {i === 0 ? "Apple silicon" : "ARM64"}{" "}
                    <span aria-hidden="true">↓</span>
                  </a>
                  <a
                    className="platform-link"
                    href={`/download/${platform}/x64`}
                  >
                    {i === 0 ? "Intel Mac" : "Intel / AMD"}{" "}
                    <span aria-hidden="true">↓</span>
                  </a>
                </article>
              ))}
            </div>
            <p className="availability">
              Builds become available here when a release is published.{" "}
              <a href="/docs#updates">
                About updates <span aria-hidden="true">›</span>
              </a>
            </p>
          </section>
        </main>
      </Layout>
    )
  );
}
export function documentation() {
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout docs>
        <main className="docs-layout">
          <aside className="docs-nav">
            <span className="eyebrow">DOCUMENTATION</span>
            <a href="/tutorials">Browser tutorials ↗</a>
            <a href="#overview">Service overview</a>
            <a href="#updates">App updates</a>
            <a href="#sync">Encrypted sync</a>
            <a href="#api">API reference</a>
            <a href="#deployment">Deployment</a>
          </aside>
          <div className="docs-content">
            <section id="overview">
              <span className="eyebrow">BUILD WITH KUDIUM</span>
              <h1>
                A workspace.
                <br />A connected foundation.
              </h1>
              <p className="lead">
                A Bun + Hono service for release distribution, encrypted sync
                records and these React pages.
              </p>
              <div className="callout">
                Desktop updates currently use GitHub Releases. Account sync in
                the desktop app is still a setup placeholder. This service
                provides the backend; connecting desktop accounts and
                provisioning encryption keys are separate steps.
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
                decrypt incoming records. Key enrollment, recovery, device
                revocation and desktop browser-mediated account connection are
                not implemented by this service.
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
            <p className="feature-label">KUDIUM BROWSER GUIDES</p>
            <h1>
              Make yourself
              <br />
              at home.
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
                      <span className="feature-label">
                        {t.steps.length} STEPS
                      </span>
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
            <h2>Building with the service?</h2>
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
          <p className="feature-label">{tutorial.category}</p>
          <h1>{tutorial.title}</h1>
          <p className="lead">{tutorial.summary}</p>
          <div className="tutorial-path">
            <span>IN THE APP</span>
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
                  alt={`${tutorial.title} in the real Kudium Browser interface with fictional Atlas Studio demo data`}
                  width="1280"
                  height="800"
                />
              </a>
              <figcaption>
                Real app interface. Fictional Atlas Studio demo data. Click to
                enlarge.
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
            <h2>Keep exploring.</h2>
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
          <span className="eyebrow">DOWNLOADS</span>
          <h1>
            This build isn’t
            <br />
            published yet.
          </h1>
          <p>There’s no release for this platform and architecture yet.</p>
          <a className="button" href="/#download">
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
    ? "Make yourself at home."
    : reset
    ? "Choose a new password."
    : forgot
    ? "Let’s get you back in."
    : "Welcome back.";
  const available = configured && (!(forgot || reset) || mailEnabled);
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout privatePage>
        <main className="auth-layout">
          <section className="auth-intro">
            <span className="eyebrow">YOUR KUDIUM ACCOUNT</span>
            <h1>{title}</h1>
            <p>One account for your browser workspace.</p>
            <p className="auth-note">
              Your account is ready for Kudium. Connecting the desktop browser
              for sync is coming in a future update.
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
  return (
    "<!doctype html>" +
    renderToStaticMarkup(
      <Layout privatePage>
        <main className="auth-layout">
          <section className="auth-intro">
            <span className="eyebrow">YOUR WORKSPACE ACCOUNT</span>
            <h1>Welcome, {name}.</h1>
            <p>{email}</p>
            <p className="auth-note">
              Your account is connected. Desktop sync connection is coming in a
              future update.
            </p>
          </section>
          <section className="auth-card">
            <h2>Your sync storage</h2>
            <p>
              {(usage.usedBytes / 1024 / 1024).toFixed(2)} MiB of{" "}
              {usage.quotas.bytes / 1024 / 1024} MiB used
            </p>
            <p>{usage.recordCount} record IDs, including deleted records.</p>
            <a className="text-link" href="/docs#sync">
              Read about encrypted sync →
            </a>
            <hr />
            <button className="button" data-sign-out>
              Sign out →
            </button>
            <p data-auth-message role="status" aria-live="polite" />
          </section>
        </main>
        <script src="/assets/auth.js" defer />
      </Layout>
    )
  );
}
