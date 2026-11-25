import { HookSource } from "./components/hook-source";
import {
  FishingHook as HookIcon,
  ArrowLeft,
  Heart,
  ArrowUpRight,
} from "lucide-react";
import { TabNav, Card as ThemeCard, Badge } from "@radix-ui/themes";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Button, Input, Select, Textarea } from "./components/web-ui";
import {
  actionContexts,
  actionTemplates,
  type HookAction,
} from "../../../packages/hooks/actions";
import { renderToStaticMarkup } from "react-dom/server";
import { Layout } from "./pages";
import {
  hookLicenses,
  type HookPackage,
} from "../../../packages/hooks/package";
import type { MarketplaceStore, HookQuery } from "./hook-marketplace";
type ListingPage = Awaited<ReturnType<MarketplaceStore["list"]>>;
type Detail = Awaited<ReturnType<MarketplaceStore["detail"]>>;
const hookStylesheetVersion = createHash("sha256")
  .update(readFileSync(new URL("../public/hooks.css", import.meta.url)))
  .digest("hex")
  .slice(0, 12);
const render = (
  content: React.ReactNode,
  title: string,
  path: string,
  privatePage = false,
  editorNonce?: string,
) =>
  "<!doctype html>" +
  renderToStaticMarkup(
    <Layout
      title={title}
      canonicalPath={path}
      privatePage={privatePage}
      stylesheet={`/assets/hooks.css?v=${hookStylesheetVersion}`}
    >
      {content}
      <template data-hook-button-template>
        <Button type="button" />
      </template>
      <template data-hook-textarea-template>
        <Textarea />
      </template>
      <script src="/assets/hooks.js" defer />
      {editorNonce !== undefined && (
        <script
          src="/assets/hook-editor.js"
          type="module"
          nonce={editorNonce}
          data-hook-editor-script
        />
      )}
    </Layout>,
  );
function ActionFields({ action }: { action?: HookAction }) {
  return (
    <details data-hook-action className="hook-source-stage" open={!action}>
      <summary data-action-title>{action?.name || "New action"}</summary>
      <label>
        Name
        <Input
          data-action-name
          defaultValue={action?.name || "New action"}
          maxLength={120}
          required
        />
      </label>
      <fieldset>
        <legend>Show for</legend>
        {actionContexts.map((c) => (
          <label key={c}>
            <Input
              type="checkbox"
              data-action-context
              value={c}
              defaultChecked={
                action ? action.contexts.includes(c) : c === "page"
              }
            />
            {c}
          </label>
        ))}
      </fieldset>
      <label>
        Handler
        <Textarea
          data-code-editor="action"
          data-action-source
          defaultValue={action?.source || "api.showResult(context.title);"}
          rows={8}
          maxLength={20000}
          spellCheck={false}
        />
      </label>
      <Input type="hidden" data-action-id defaultValue={action?.id || ""} />
      <Button type="button" color="red" variant="soft" data-remove-action>
        Remove action
      </Button>
    </details>
  );
}
function StageBadges({ pkg }: { pkg: HookPackage }) {
  return (
    <div className="hook-stage-labels">
      {!!pkg.actions?.length && (
        <Badge color="gray">
          {pkg.actions.length} context menu{" "}
          {pkg.actions.length === 1 ? "action" : "actions"}
        </Badge>
      )}
      {Object.entries(pkg.lifecycle)
        .filter(([, code]) => code.trim())
        .map(([stage]) => (
          <Badge color="gray" key={stage}>
            {stage === "css" ? "CSS" : `${stage} load`}
          </Badge>
        ))}
    </div>
  );
}
const authorDisplayName = (name: string) =>
  name.replace(
    /(^|\s)(\p{L})/gu,
    (_, space: string, letter: string) =>
      space + letter.toLocaleUpperCase("en"),
  );
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
      {item.hook.images?.[0] && (
        <a href={`/hooks/${item.hook.id}`} className="hook-card-image">
          <img
            src={`/hook-images/${item.hook.images[0]}/thumb.webp`}
            alt={`${item.hook.name} screenshot`}
            loading="lazy"
          />
        </a>
      )}
      <div className="hook-card-top">
        <span className="hook-site-mark" aria-hidden="true">
          {item.package.applicability === "general" ? (
            <HookIcon size={18} strokeWidth={1.5} />
          ) : (
            <>
              <img
                data-hook-site-icon
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.package.sites[0].host)}&sz=64`}
                alt=""
                width="20"
                height="20"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <span>
                {item.package.sites[0].host.slice(0, 1).toUpperCase()}
              </span>
            </>
          )}
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
        <span>
          By {authorDisplayName(item.author.name)} · @{item.author.username}
        </span>
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
  admin = false,
) {
  const next = new URLSearchParams({
    ...query,
    ...(page.nextCursor ? { cursor: page.nextCursor } : {}),
  });
  const path = admin ? "/hooks/admin" : mine ? "/account/hooks" : "/hooks";
  return render(
    <main
      className="hooks-marketplace hooks-library hooks-browse"
      data-hook-marketplace
    >
      <div className="hooks-heading">
        <div>
          <h1>
            {admin
              ? "Marketplace moderation"
              : mine
                ? "Your hooks"
                : "Browse hooks"}
          </h1>
        </div>
        <Button asChild size="3" variant="solid">
          <a href="/hooks/new">Publish a hook</a>
        </Button>
      </div>
      <div className="hook-browse-toolbar">
        <TabNav.Root
          className="hook-browse-nav"
          aria-label="Hooks navigation"
          size="1"
        >
          <TabNav.Link href="/hooks" active={!mine && !admin}>
            Explore
          </TabNav.Link>
          <TabNav.Link href="/account/hooks" active={mine && !admin}>
            Your hooks
          </TabNav.Link>
          {admin && (
            <TabNav.Link href="/hooks/admin" active>
              Moderation
            </TabNav.Link>
          )}
        </TabNav.Root>
        <TabNav.Root
          className="hook-browse-order"
          aria-label="Sort hooks"
          size="1"
          color="gray"
        >
          {(["trending", "newest"] as const).map((sort) => (
            <TabNav.Link
              key={sort}
              href={`${path}?${new URLSearchParams({ ...query, sort })}`}
              active={(query.sort || "newest") === sort}
              title={
                sort === "trending"
                  ? "Most liked, with recently updated first for ties"
                  : "Most recently updated"
              }
            >
              {sort === "trending" ? "Trending" : "Recently updated"}
            </TabNav.Link>
          ))}
        </TabNav.Root>
      </div>
      <form
        id="hook-search-form"
        className="hook-search"
        method="get"
        action={path}
      >
        <Input
          type="hidden"
          name="sort"
          defaultValue={query.sort || "newest"}
        />
        <label>
          <span className="visually-hidden">Search hooks</span>
          <Input
            name="q"
            type="search"
            placeholder="Search hooks"
            defaultValue={query.q}
          />
        </label>
        <Button size="3" color="gray" variant="surface" type="submit">
          Search
        </Button>
        <details
          className="hook-browse-filters"
          open={!!query.site || query.kind !== "all"}
        >
          <Button asChild size="3" color="gray" variant="surface">
            <summary>
              Filters
              {(query.site || query.kind !== "all") && (
                <Badge color="gray">
                  {Number(!!query.site) + Number(query.kind !== "all")}
                </Badge>
              )}
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
          </Button>
          <ThemeCard className="hook-filter-panel" size="2">
            <div className="hook-filter-fields">
              <label>
                Website
                <Input
                  name="site"
                  placeholder="e.g. github.com"
                  defaultValue={query.site}
                />
              </label>
              <label>
                Hook type
                <Select name="kind" defaultValue={query.kind}>
                  <option value="all">All hooks</option>
                  <option value="site">Site-specific</option>
                  <option value="general">General hooks</option>
                </Select>
              </label>
              <Button size="3" variant="solid" type="submit">
                Apply filters
              </Button>
            </div>
          </ThemeCard>
        </details>
      </form>
      {query.q && (
        <p className="hook-search-context">Results for “{query.q}”</p>
      )}
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
          <svg
            className="hook-empty-icon"
            aria-hidden="true"
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="m9 9-3 3 3 3m6-6 3 3-3 3" />
          </svg>
          <h2>
            {query.q || query.site || query.kind !== "all"
              ? "No matching hooks"
              : admin
                ? "No submissions to review"
                : mine
                  ? "No published hooks yet"
                  : "No hooks yet"}
          </h2>
          <p>
            {query.q || query.site || query.kind !== "all"
              ? "Try another name or clear your filters."
              : admin
                ? "New submissions will appear here."
                : "Share a script or style you’ve made for Kudium."}
          </p>
          {(!admin || query.q || query.site || query.kind !== "all") && (
            <a
              href={
                query.q || query.site || query.kind !== "all"
                  ? path
                  : "/hooks/new"
              }
            >
              {query.q || query.site || query.kind !== "all"
                ? "Clear filters"
                : "Create a hook"}
            </a>
          )}
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
    mine || admin,
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
      <Button asChild variant="ghost" color="gray" className="hook-detail-back">
        <a href="/hooks">
          <ArrowLeft size={14} />
          Browse hooks
        </a>
      </Button>
      <div className="hook-detail-intro">
        <div className="hook-detail-title-row">
          <span className="hook-detail-mark" aria-hidden="true">
            {pkg.applicability === "general" ? (
              <HookIcon size={24} strokeWidth={1.5} />
            ) : (
              <>
                <img
                  data-hook-site-icon
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(pkg.sites[0].host)}&sz=64`}
                  alt=""
                  width="24"
                  height="24"
                  referrerPolicy="no-referrer"
                />
                <span>{pkg.sites[0].host.slice(0, 1).toUpperCase()}</span>
              </>
            )}
          </span>
          <div>
            <h1>{hook.name}</h1>
            <span className="hook-detail-scope">
              {pkg.applicability === "general"
                ? "General hook"
                : pkg.sites.map((site) => site.host).join(" · ")}
            </span>
          </div>
        </div>
        <p className="hook-description">{hook.description}</p>
        <div className="hook-byline">
          <span>
            By {authorDisplayName(detail.author.name)} · @
            {detail.author.username}
          </span>
          <span>Version {hook.version}</span>
          <Button
            type="button"
            variant="ghost"
            aria-label="Like this hook"
            data-hook-like
            aria-pressed={detail.liked}
          >
            <Heart size={14} /> <span data-like-count>{hook.likes}</span>
          </Button>
        </div>
      </div>
      <div className="hook-detail-layout">
        <article className="hook-detail-content">
          {!!hook.images?.length && (
            <section className="hook-gallery" aria-label="Hook screenshots">
              {hook.images.map((key, index) => (
                <a
                  key={key}
                  href={`/hook-images/${key}/main.webp`}
                  target="_blank"
                  rel="noopener"
                  data-hook-screenshot
                  aria-label={`View ${hook.name} screenshot ${index + 1}`}
                >
                  <img
                    src={`/hook-images/${key}/thumb.webp`}
                    alt={`${hook.name} screenshot ${index + 1}`}
                    loading={index ? "lazy" : "eager"}
                  />
                </a>
              ))}
              <dialog className="hook-image-viewer" aria-label={`${hook.name} screenshots`} data-hook-image-viewer>
                <div className="hook-image-viewer-toolbar">
                  <span data-image-caption aria-live="polite" />
                  <button type="button" data-image-close aria-label="Close image viewer" autoFocus>×</button>
                </div>
                <div className="hook-image-viewer-stage">
                  <button type="button" data-image-previous aria-label="Previous screenshot">‹</button>
                  <img data-image-full alt="" />
                  <p data-image-error role="status" hidden>Unable to load this screenshot.</p>
                  <button type="button" data-image-next aria-label="Next screenshot">›</button>
                </div>
              </dialog>
            </section>
          )}
          <section className="hook-code-section">
            <div className="hook-section-heading">
              <h2>Source code</h2>
              <StageBadges pkg={pkg} />
            </div>
            <p>
              Review the source before you install. Hooks change the pages where
              you enable them.
            </p>
            {pkg.actions?.map((action) => (
              <details key={action.id}>
                <summary>{action.name} · context menu</summary>
                <p>Show for: {action.contexts.join(", ")}</p>
                <HookSource source={action.source} />
              </details>
            ))}
            {Object.entries(pkg.lifecycle)
              .filter(([, source]) => source.trim())
              .map(([stage, source]) => (
                <details key={stage}>
                  <summary>
                    {stage === "css"
                      ? "CSS styles"
                      : `${
                          stage === "before" ? "Before" : "After"
                        } load script`}
                  </summary>
                  <HookSource
                    source={source}
                    language={stage === "css" ? "css" : "javascript"}
                  />
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
                <Textarea
                  id="hook-comment-body"
                  name="body"
                  maxLength={2000}
                  required
                  rows={3}
                />
                <Button className="hook-primary">Post comment</Button>
              </form>
            ) : (
              <p>
                <a
                  href={`/sign-in?next=${encodeURIComponent(
                    `/hooks/${hook.id}`,
                  )}`}
                >
                  Sign in
                </a>{" "}
                to like this hook or join the discussion.
              </p>
            )}
            <div data-hook-comments />
            <Button className="hook-more" data-comment-more hidden>
              Load more comments
            </Button>
          </section>
        </article>
        <aside className="hook-detail-sidebar">
          <ThemeCard asChild size="3" className="hook-detail-install">
            <section>
              <h2>Install hook</h2>
              <p>
                Preview in Kudium, choose where it runs, then enable it when
                you’re ready.
              </p>
              <Button asChild size="3" variant="solid">
                <a data-hook-install href={packageURL}>
                  Open in Kudium
                  <ArrowUpRight size={16} />
                </a>
              </Button>
              <Button
                size="3"
                color="gray"
                variant="surface"
                type="button"
                data-copy-package={packageURL}
              >
                Copy install link
              </Button>
            </section>
          </ThemeCard>
          <section className="hook-info-card">
            <h2>Hook details</h2>
            <dl>
              <dt>Works on</dt>
              <dd>
                {pkg.applicability === "general"
                  ? "Selected groups or all groups"
                  : pkg.sites
                      .map(
                        (s) =>
                          `${s.host}${s.includeSubdomains ? " + subdomains" : ""}`,
                      )
                      .join(", ")}
              </dd>
              <dt>Page path</dt>
              <dd>
                <code>{pkg.path}</code>
              </dd>
              {pkg.testUrl && (
                <>
                  <dt>Test website</dt>
                  <dd>
                    <a href={pkg.testUrl} target="_blank" rel="noreferrer">
                      {pkg.testUrl}
                    </a>
                  </dd>
                </>
              )}
              <dt>License</dt>
              <dd>{pkg.license}</dd>
              <dt>Requires Kudium</dt>
              <dd>{pkg.minimumBrowserVersion} or later</dd>
            </dl>
            <div className="hook-management">
              {hook.authorId === viewer && (
                <Button asChild variant="surface" color="gray">
                  <a href={`/hooks/${hook.id}/edit`}>Edit hook</a>
                </Button>
              )}
              {hook.status !== "approved" && (
                <p className="hook-notice">
                  {hook.status}: {hook.statusReason}
                </p>
              )}
              {viewer && (
                <Button
                  type="button"
                  variant="ghost"
                  color="gray"
                  data-report-hook
                >
                  Report this hook
                </Button>
              )}
            </div>
            {admin && (
              <form data-hook-moderate>
                <label>
                  Status
                  <Select name="status" defaultValue={hook.status}>
                    <option>approved</option>
                    <option>pending</option>
                    <option>rejected</option>
                  </Select>
                </label>
                <label>
                  Reason
                  <Textarea name="reason" maxLength={2000} />
                </label>
                <Button>Save moderation decision</Button>
              </form>
            )}
          </section>
          <div className="hook-feedback" role="status" data-hook-feedback />
        </aside>
      </div>
    </main>,
    hook.name,
    `/hooks/${hook.id}`,
    hook.status !== "approved",
  );
}
export function hookPublishPage(
  detail?: Detail,
  editorNonce = "",
  username = detail?.author?.username || "",
) {
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
          <Input
            type="file"
            accept="application/json,.json"
            data-import-hook
            className="visually-hidden"
            form="hook-publish-form"
          />
        </label>
      </div>
      <p>Add your hook’s details, choose where it runs, and review the code.</p>
      <form
        id="hook-publish-form"
        data-hook-publish
        data-images={JSON.stringify(detail?.hook.images || [])}
        data-id={detail?.hook.id || ""}
        data-version={detail?.hook.version || ""}
      >
        <fieldset className="hook-form-section">
          <legend>Screenshots</legend>
          <label>
            Add screenshots
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              data-hook-images
            />
            <span>
              Up to 3 screenshots, 5 MB each. Images are compressed to WebP;
              originals and metadata are discarded.
            </span>
          </label>
          <div data-image-previews className="hook-image-previews"></div>
          <p data-image-feedback role="status" aria-live="polite"></p>
        </fieldset>
        <fieldset className="hook-form-section">
          <legend>Details</legend>
          <label>
            Publisher username
            <Input
              name="username"
              defaultValue={username.startsWith("publisher-") ? "" : username}
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z][A-Za-z0-9_]{2,29}"
              required
              placeholder="e.g. atlas_studio"
              autoComplete="username"
            />
            <span>
              Your unique @username appears on all your hooks. Use 3–30 letters,
              numbers or underscores, starting with a letter.
            </span>
          </label>
          <div className="hook-form-grid">
            <label>
              Name
              <Input
                name="name"
                defaultValue={pkg?.name}
                maxLength={120}
                required
                placeholder="e.g. Quiet reading"
              />
            </label>
            <label>
              License
              <Select name="license" defaultValue={pkg?.license || "MIT"}>
                {hookLicenses.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </Select>
            </label>
          </div>
          <label>
            Description
            <Textarea
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
              <Select
                name="applicability"
                defaultValue={pkg?.applicability || "site"}
              >
                <option value="site">Specific websites</option>
                <option value="general">Any website</option>
              </Select>
            </label>
            <label>
              Target domains
              <Input
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
              <Input
                name="path"
                defaultValue={pkg?.path || "/*"}
                required
                maxLength={500}
              />
              <small>
                * matches characters. Query strings and fragments are ignored.
              </small>
            </label>
            <label>
              Test website URL
              <Input
                type="url"
                name="testUrl"
                defaultValue={pkg?.testUrl || ""}
                maxLength={4096}
                placeholder="https://example.com"
              />
            </label>
            <label>
              Minimum browser version
              <Input
                name="minimumBrowserVersion"
                defaultValue={pkg?.minimumBrowserVersion || "1.0.0"}
                required
              />
            </label>
          </div>
        </fieldset>
        <fieldset
          className="hook-form-section hook-code-fields"
          data-code-stages
        >
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
                <Textarea
                  name={phase}
                  data-code-editor={phase === "css" ? "css" : "lifecycle"}
                  defaultValue={pkg?.lifecycle[phase]}
                  rows={9}
                  maxLength={20000}
                  spellCheck={false}
                />
              </label>
            </details>
          ))}
        </fieldset>
        <fieldset
          className="hook-form-section"
          data-hook-actions
          data-action-templates={JSON.stringify(actionTemplates)}
        >
          <legend>Context menu actions</legend>
          <p>Actions run when you choose them from the right-click menu.</p>
          <div data-action-list>
            {pkg?.actions?.map((action) => (
              <ActionFields key={action.id} action={action} />
            ))}
          </div>
          <template data-action-template>
            <ActionFields />
          </template>
          <div className="hook-action-toolbar">
            <label>
              Start with
              <Select data-action-example>
                <option value="custom">Custom action</option>
                {actionTemplates.map((a, i) => (
                  <option key={a.name} value={i}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button className="hook-primary" type="button" data-add-action>
              Add action
            </Button>
          </div>
        </fieldset>
        <label className="hook-license-confirm">
          <Input type="checkbox" required /> I have the right to publish this
          code under the selected license.
        </label>
        <div className="hook-publish-actions">
          <p data-hook-feedback role="status" />
          <Button className="hook-primary" type="submit">
            {detail ? "Publish new version" : "Publish hook"}
          </Button>
        </div>
      </form>
    </main>,
    detail ? "Update hook" : "Publish hook",
    "/hooks/new",
    true,
    editorNonce,
  );
}
