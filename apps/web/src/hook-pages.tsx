import { actionContexts, actionTemplates, type HookAction } from '../../../packages/hooks/actions';
import { renderToStaticMarkup } from "react-dom/server";
import { Layout } from "./pages";
import {
  hookLicenses,
  type HookPackage,
} from "../../../packages/hooks/package";
import type { MarketplaceStore, HookQuery } from "./hook-marketplace";
type ListingPage = Awaited<ReturnType<MarketplaceStore["list"]>>;
type Detail = Awaited<ReturnType<MarketplaceStore["detail"]>>;
const render = (
  content: React.ReactNode,
  title: string,
  path: string,
  privatePage = false
) =>
  "<!doctype html>" +
  renderToStaticMarkup(
    <Layout
      title={title}
      canonicalPath={path}
      privatePage={privatePage}
      stylesheet="/assets/hooks.css"
    >
      {content}
      <script src="/assets/hooks.js" defer />
    </Layout>
  );
function ActionFields({ action }: { action?: HookAction }) {
  return <details data-hook-action className="hook-source-stage" open={!action}>
    <summary data-action-title>{action?.name || 'New action'}</summary>
    <label>Name<input data-action-name defaultValue={action?.name || 'New action'} maxLength={120} required /></label>
    <fieldset><legend>Show for</legend>{actionContexts.map(c => <label key={c}><input type="checkbox" data-action-context value={c} defaultChecked={action ? action.contexts.includes(c) : c === 'page'} />{c}</label>)}</fieldset>
    <label>Handler<textarea data-action-source defaultValue={action?.source || 'api.showResult(context.title);'} rows={8} maxLength={20000} spellCheck={false} /></label>
    <input type="hidden" data-action-id defaultValue={action?.id || ''} />
    <button type="button" data-remove-action>Remove action</button>
  </details>;
}
function StageBadges({ pkg }: { pkg: HookPackage }) {
  return (
    <div className="hook-badges">
      {!!pkg.actions?.length && <span>{pkg.actions.length} context menu actions</span>}
      {Object.entries(pkg.lifecycle)
        .filter(([, code]) => code.trim())
        .map(([stage]) => (
          <span key={stage}>{stage === "css" ? "CSS" : `${stage} load`}</span>
        ))}
    </div>
  );
}
function Card({
  item,
  mine,
  admin = false,
}: {
  admin?: boolean;
  item: ListingPage["items"][number];
  mine: boolean;
}) {
  return (
    <article className="hook-card">
      <div className="hook-card-top">
        <span className="hook-site-mark" aria-hidden="true">
          {item.package.applicability === "general"
            ? "◎"
            : item.hook.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hook-type">
          {item.package.applicability === "general"
            ? "General hook"
            : item.package.sites.map((s) => s.host).join(", ")}
        </span>
      </div>
      <a className="hook-card-title" href={`/hooks/${item.hook.id}`}>
        {item.hook.name}
      </a>
      <p>{item.hook.description}</p>
      <div className="hook-card-footer">
        <span>By {item.author.name}</span>
        <span>♡ {item.hook.likes}</span>
      </div>
      {mine && (
        <div className="hook-owner-state">
          <span>{item.hook.status}</span>
          {item.hook.statusReason && <p>{item.hook.statusReason}</p>}
          <a
            href={
              admin ? `/hooks/${item.hook.id}` : `/hooks/${item.hook.id}/edit`
            }
          >
            {admin ? "Review submission" : "Edit hook"}
          </a>
        </div>
      )}
    </article>
  );
}
export function hookIndexPage(
  page: ListingPage,
  query: HookQuery,
  mine = false,
  admin = false
) {
  const next = new URLSearchParams({
    ...query,
    ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
  });
  const path = admin ? "/hooks/admin" : mine ? "/account/hooks" : "/hooks";
  return render(
    <main className="hooks-marketplace hooks-library" data-hook-marketplace>
      <div className="hooks-heading">
        <div>
          <h1>
            {admin
              ? "Marketplace moderation"
              : mine
              ? "Your hooks"
              : "Hooks"}
          </h1>
          <p>
            {admin
              ? "Review submissions and manage published hooks."
              : mine
              ? "Manage the hooks you’ve shared with the community."
              : "Scripts and styles for your favourite websites."}
          </p>
        </div>
        <a className="hook-primary" href="/hooks/new">
          Publish a hook
        </a>
      </div>
      <nav className="hooks-section-links" aria-label="Hooks navigation">
        <a href="/hooks" aria-current={!mine && !admin ? "page" : undefined}>Explore</a>
        <a href="/account/hooks" aria-current={mine && !admin ? "page" : undefined}>Your hooks</a>
        {admin && <a href="/hooks/admin" aria-current="page">Moderation</a>}
      </nav>
      <form className="hook-search" method="get" action={path}>
        <label>
          <span className="visually-hidden">Search hooks</span>
          <input
            name="q"
            type="search"
            placeholder="Search hooks"
            defaultValue={query.q}
          />
        </label>
        <label>
          <span className="visually-hidden">Site</span>
          <input
            name="site"
            placeholder="Website, e.g. github.com"
            defaultValue={query.site}
          />
        </label>
        <label>
          <span className="visually-hidden">Hook type</span>
          <select name="kind" defaultValue={query.kind}>
            <option value="all">All hooks</option>
            <option value="site">Site-specific</option>
            <option value="general">General hooks</option>
          </select>
        </label>
        <button className="hook-filter-button" type="submit">
          Search
        </button>
      </form>
      {page.items.length > 0 && <div className="hooks-results-heading">
        <h2>
          {query.q
            ? `Results for “${query.q}”`
            : admin ? "Submissions" : mine ? "Published hooks" : "All hooks"}
        </h2>
        <span>Newest first</span>
      </div>}
      <div className="hook-grid">
        {page.items.map((item) => (
          <Card
            key={item.hook.id}
            item={item}
            mine={mine || admin}
            admin={admin}
          />
        ))}
      </div>
      {!page.items.length && (
        <div className="hook-empty">
          <svg className="hook-empty-icon" aria-hidden="true" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m9 9-3 3 3 3m6-6 3 3-3 3" /></svg>
          <h2>{query.q || query.site || query.kind !== "all" ? "No matching hooks" : admin ? "No submissions to review" : mine ? "No published hooks yet" : "No hooks yet"}</h2>
          <p>
            {query.q || query.site || query.kind !== "all"
              ? "Try another name or clear your filters."
              : admin ? "New submissions will appear here." : "Share a script or style you’ve made for Kudium."}
          </p>
          {(!admin || query.q || query.site || query.kind !== "all") && <a href={query.q || query.site || query.kind !== "all" ? path : "/hooks/new"}>
            {query.q || query.site || query.kind !== "all" ? "Clear filters" : "Create a hook"}
          </a>}
        </div>
      )}
      {page.nextCursor && (
        <a className="hook-more" data-hook-more href={`${path}?${next}`}>
          Load more hooks
        </a>
      )}
    </main>,
    admin ? "Hook moderation" : mine ? "Your hooks" : "Hooks",
    path,
    mine || admin
  );
}
export function hookDetailPage(detail: Detail, viewer?: string, admin = false) {
  const { hook, package: pkg } = detail;
  const packageURL = `/v1/hooks/${hook.id}/versions/${hook.version}/package`;
  return render(
    <main
      className="hooks-marketplace hooks-library hook-detail"
      data-hook-id={hook.id}
      data-viewer={viewer || ""}
      data-liked={String(detail.liked)}
      data-admin={String(admin)}
    >
      <a className="hook-back" href="/hooks">
        ← Explore hooks
      </a>
      <div className="hook-detail-layout">
        <article>
          <div className="hook-detail-intro">
            <span className="hooks-eyebrow">
              {pkg.applicability === "general"
                ? "Across websites"
                : pkg.sites.map((s) => s.host).join(" · ")}
            </span>
            <h1>{hook.name}</h1>
            <p className="hook-description">{hook.description}</p>
            <div className="hook-byline">
              By {detail.author.name} · Version {hook.version}{" "}
              <button type="button" data-hook-like aria-pressed={detail.liked}>
                ♡ <span data-like-count>{hook.likes}</span>
              </button>
            </div>
            <StageBadges pkg={pkg} />
          </div>
          <section className="hook-code-section">
            <h2>Source code</h2>
            <p>
              Review the source before you install. Hooks change the pages where
              you enable them.
            </p>
            {pkg.actions?.map(action => <details key={action.id}><summary>{action.name} · context menu</summary><p>Show for: {action.contexts.join(', ')}</p><pre>{action.source}</pre></details>)}
            {Object.entries(pkg.lifecycle)
              .filter(([, source]) => source.trim())
              .map(([stage, source]) => (
                <details key={stage} open={stage === "css"}>
                  <summary>
                    {stage === "css"
                      ? "CSS styles"
                      : `${
                          stage === "before" ? "Before" : "After"
                        } load script`}
                  </summary>
                  <pre>
                    <code>{source}</code>
                  </pre>
                </details>
              ))}
          </section>
          <section>
            <h2>Version history</h2>
            <ul className="hook-versions">
              {detail.versions.map((v) => (
                <li key={v.version}>
                  {v.status === "approved" ? (
                    <a
                      href={`/v1/hooks/${hook.id}/versions/${v.version}/package`}
                    >
                      Version {v.version}
                    </a>
                  ) : (
                    <span>
                      Version {v.version} · {v.status}
                    </span>
                  )}
                  <time>
                    {new Date(v.createdAt).toLocaleDateString("en", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </li>
              ))}
            </ul>
          </section>
          <section className="hook-discussion">
            <h2>Discussion</h2>
            {viewer ? (
              <form data-hook-comment>
                <label htmlFor="hook-comment-body">
                  Share feedback or ask a question
                </label>
                <textarea
                  id="hook-comment-body"
                  name="body"
                  maxLength={2000}
                  required
                  rows={3}
                />
                <button className="hook-primary">Post comment</button>
              </form>
            ) : (
              <p>
                <a
                  href={`/sign-in?next=${encodeURIComponent(
                    `/hooks/${hook.id}`
                  )}`}
                >
                  Sign in
                </a>{" "}
                to like this hook or join the discussion.
              </p>
            )}
            <div data-hook-comments />
            <button className="hook-more" data-comment-more hidden>
              Load more comments
            </button>
          </section>
        </article>
        <aside className="hook-install-card">
          <h2>Install hook</h2>
          <p>
            Preview in Kudium, choose where it runs, then enable it when you’re
            ready.
          </p>
          <a className="hook-primary" data-hook-install href={packageURL}>
            Open in Kudium
          </a>
          <button type="button" data-copy-package={packageURL}>
            Copy install link
          </button>
          <dl>
            <dt>Works on</dt>
            <dd>
              {pkg.applicability === "general"
                ? "Selected groups or all groups"
                : pkg.sites
                    .map(
                      (s) =>
                        `${s.host}${s.includeSubdomains ? " + subdomains" : ""}`
                    )
                    .join(", ")}
            </dd>
            <dt>Page path</dt>
            <dd>
              <code>{pkg.path}</code>
            </dd>
            {pkg.testUrl && <><dt>Test website</dt><dd><a href={pkg.testUrl} target="_blank" rel="noreferrer">{pkg.testUrl}</a></dd></>}
            <dt>License</dt>
            <dd>{pkg.license}</dd>
            <dt>Browser</dt>
            <dd>{pkg.minimumBrowserVersion} or later</dd>
          </dl>
          {hook.authorId === viewer && (
            <a href={`/hooks/${hook.id}/edit`}>Edit hook</a>
          )}
          {hook.status !== "approved" && (
            <p className="hook-notice">
              {hook.status}: {hook.statusReason}
            </p>
          )}
          {viewer && (
            <button type="button" data-report-hook>
              Report this hook
            </button>
          )}
          {admin && (
            <form data-hook-moderate>
              <label>
                Status
                <select name="status" defaultValue={hook.status}>
                  <option>approved</option>
                  <option>pending</option>
                  <option>rejected</option>
                </select>
              </label>
              <label>
                Reason
                <textarea name="reason" maxLength={2000} />
              </label>
              <button>Save moderation decision</button>
            </form>
          )}
          <div className="hook-feedback" role="status" data-hook-feedback />
        </aside>
      </div>
    </main>,
    hook.name,
    `/hooks/${hook.id}`,
    hook.status !== "approved"
  );
}
export function hookPublishPage(detail?: Detail) {
  const pkg = detail?.package;
  return render(
    <main className="hooks-marketplace hooks-library hook-publish">
      <a className="hook-back" href="/account/hooks">
        ← Your hooks
      </a>
      <div className="hook-publish-heading">
        <h1>{detail ? "Publish an update" : "Publish a hook"}</h1>
        <label className="hook-import-file">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            data-import-hook
            className="visually-hidden"
            form="hook-publish-form"
          />
        </label>
      </div>
      <p>
        Add your hook’s details, choose where it runs, and review the code.
      </p>
      <form
        id="hook-publish-form"
        data-hook-publish
        data-id={detail?.hook.id || ""}
        data-version={detail?.hook.version || ""}
      >
        <fieldset className="hook-form-section">
          <legend>Details</legend>
        <div className="hook-form-grid">
          <label>
            Name
            <input
              name="name"
              defaultValue={pkg?.name}
              maxLength={120}
              required
              placeholder="e.g. Quiet reading"
            />
          </label>
          <label>
            License
            <select name="license" defaultValue={pkg?.license || "MIT"}>
              {hookLicenses.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={pkg?.description}
            maxLength={4000}
            required
            rows={3}
            placeholder="Describe what your hook changes."
          />
        </label>
        </fieldset>
        <fieldset className="hook-form-section">
          <legend>Where it runs</legend>
        <div className="hook-form-grid">
          <label>
            Works on
            <select
              name="applicability"
              defaultValue={pkg?.applicability || "site"}
            >
              <option value="site">Specific websites</option>
              <option value="general">Any website</option>
            </select>
          </label>
          <label>
            Target domains
            <input
              name="sites"
              defaultValue={pkg?.sites
                .map((s) => (s.includeSubdomains ? "*." : "") + s.host)
                .join(", ")}
              placeholder="github.com, *.example.com"
            />
            <small>Comma-separated. Use *. to include subdomains.</small>
          </label>
          <label>
            Page pathname
            <input
              name="path"
              defaultValue={pkg?.path || "/*"}
              required
              maxLength={500}
            />
            <small>
              * matches characters. Query strings and fragments are ignored.
            </small>
          </label>
          <label>Test website URL<input type="url" name="testUrl" defaultValue={pkg?.testUrl || ""} maxLength={4096} placeholder="https://example.com" /></label>
          <label>
            Minimum browser version
            <input
              name="minimumBrowserVersion"
              defaultValue={pkg?.minimumBrowserVersion || "1.0.0"}
              required
            />
          </label>
        </div>
        </fieldset>
        <fieldset className="hook-form-section hook-code-fields">
          <legend>Code</legend>
        {(["before", "after", "css"] as const).map((phase) => (
          <details
            key={phase}
            className="hook-source-stage"
            open={!!pkg?.lifecycle[phase]?.trim() || phase === "after"}
          >
            <summary>
              {phase === "css"
                ? "CSS styles"
                : `${phase === "before" ? "Before" : "After"} load script`}
            </summary>
            <label className="hook-source-label">
              <span className="visually-hidden">{phase} source</span>
              <textarea
                name={phase}
                defaultValue={pkg?.lifecycle[phase]}
                rows={9}
                maxLength={20000}
                spellCheck={false}
              />
            </label>
          </details>
        ))}
        </fieldset>
        <fieldset className="hook-form-section" data-hook-actions data-action-templates={JSON.stringify(actionTemplates)}>
          <legend>Context menu actions</legend>
          <p>Actions run when you choose them from the right-click menu.</p>
          <div data-action-list>{pkg?.actions?.map(action => <ActionFields key={action.id} action={action} />)}</div>
          <template data-action-template><ActionFields /></template>
          <div className="hook-publish-actions"><select aria-label="Action example" data-action-example><option value="custom">Custom action</option>{actionTemplates.map((a, i) => <option key={a.name} value={i}>{a.name}</option>)}</select><button type="button" data-add-action>Add action</button></div>
        </fieldset>
        <label className="hook-license-confirm">
          <input type="checkbox" required /> I have the right to publish this
          code under the selected license.
        </label>
        <div className="hook-publish-actions">
          <p data-hook-feedback role="status" />
          <button className="hook-primary" type="submit">
            {detail ? "Publish new version" : "Publish hook"}
          </button>
        </div>
      </form>
    </main>,
    detail ? "Update hook" : "Publish hook",
    "/hooks/new",
    true
  );
}
