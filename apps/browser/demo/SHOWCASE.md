# Refresh the website showcase

Use this runbook whenever the browser UI changes or homepage images become stale.

## Fixture

Reuse `atlas-studio/`: a fictional creative studio shipping its Coastal collection.
The overview, brief, research and accessibility pages are local demo pages.
`docs/launch-plan.md` supplies fictional owners, tasks, milestones, research findings
and a practical AI draft. Keep the same names and fixed dates between captures.
Add meaningful project files here rather than seeding personal projects or accounts.

## Capture from the repository root

1. Inspect Git status; preserve existing working edits.
2. Ensure browser dependencies, Bun and Python Pillow are installed.
3. Start the renderer with `npm run dev:browser` if port 1212 is not already serving it.
4. Port 4178 must be free: the capture process owns the local fixture server.
5. Run `npm run showcase:refresh`. This runs the disposable Electron capture,
   validates expected visible text and prepares WebP derivatives and device frames.
6. Inspect `apps/web/public/product/demo/manifest.json`: every expected scenario
   must be present and verified. Open the full captures and inspect readable text,
   populated content, unclipped panels, correct themes and no loading/error states.
7. Inspect solid `ai-context.webp` and optional `ai-glassy.webp` side by side.
   Glassy AI panel defaults off. Enable it via the production preferences service
   only in the disposable profile; restore it before other scenarios.
8. When adding a scenario, update the `demoAssets` allowlist in `apps/web/src/app.ts`,
   homepage image/caption/tutorial/control mappings in `pages.tsx`, and image cache
   query versions. Run `npm run check:web` and the relevant web tests.

## Truth and privacy

Capture production UI with real native webpage views; never redraw browser chrome
or invent assistant answers. AI drafts stay unsent, with a real reference attachment.
The terminal runs the fixture test; script lists and hook activity are explicitly
illustrative. Public websites may change or fail to load: inspect captures and rerun
rather than accepting an error page. Never photograph signed-in personal accounts.
The harness creates its own temporary profile and must not clear the user's profile.

PNG masters and the manifest remain outside public routes. WebP files are explicitly
allowlisted. A failed capture must be fixed and rerun before accepting a refresh.
Website deployment is separate; a local refresh does not publish the site or release
installers. Do not run release tooling for screenshot updates.

## Copyable instruction for an LLM

“Read AGENTS.md and apps/browser/demo/SHOWCASE.md. Refresh the website screenshots
from the current browser UI using Atlas Studio and its launch-plan fixture. Capture
the solid default and optional glassy AI panel, preserve unrelated edits, verify the
manifest and visually inspect the images, update asset mappings/cache versions, and
run web checks. Report the local result and deployment status.”
