# Kudium Browser demonstration workspace

Atlas Studio is a fictional design studio with a collection brief, editorial tasks, a working Bun preview, project source files, an accessibility checklist and design tokens. All people, metrics and project names are illustrative. It contains no personal credentials or customer data.

## Try it in Kudium Browser

1. From `apps/browser/demo/atlas-studio`, run `bun run dev`.
2. Open `http://127.0.0.1:4178/` in Kudium Browser.
3. Create an Atlas Studio group with overview, brief, research and accessibility tabs.
4. Open Developer, select the group and link the `atlas-studio` directory.
5. Use Files to inspect `src/app.ts`, filter for README, and try editing a comment. Use a copy of the project for destructive file operations.
6. Add project-scoped Scripts: `bun run dev`, `bun run check`, `bun run build`.
7. Run `bun run check` in the terminal and inspect the real output.
8. Attach `docs/brief.md` to an AI conversation. A configured provider is needed to send it; photography keeps this as an unsent draft.

## Reproduce photography

Requirements: installed browser dependencies, Python 3 with Pillow, and the browser renderer dev server on port 1212 (`npm run dev:browser` from the monorepo root). Stop the separate Atlas Studio server before photographing because capture owns port 4178.

From `apps/browser`:

```sh
./node_modules/.bin/electron .erb/scripts/demo-photography.cjs
python3 demo/prepare-images.py
```

The capture script creates a disposable Electron profile and runs the real browser UI, native webpage views, file manager, editor, scripts menu, hook editor and terminal. It does not change your normal browser profile. File reads use the production project-files service. The terminal actually runs the supplied demo test. Script-menu entries and hook activity are seeded fixtures. The AI image shows a real attached brief and an unsent draft, with no invented assistant response.

Electron captures the browser chrome and native page view separately. The script combines those captured layers at their actual view bounds, without changing content. PNG masters and the verification manifest are in `apps/web/public/product/demo`. WebP derivatives are served to the website; manifests and raw PNGs are not public routes. Device mockups crop to the real frame's display ratio without stretching.

## Scenarios

- Light and dark browser workspaces: a creative project and a separate personal group.
- AI context: a project reference attached to an unsent accessibility-review prompt.
- File manager: populated project root, expanded source folder, filename filter.
- Editor: meaningful TypeScript project data, light and dark modes.
- Scripts: named development, checking and build commands with project scope.
- Website hooks: an accessible heading adjustment, CSS focus style and illustrative activity.
- Terminal: a real successful `bun run check` against the demo test.

Tutorials live under `/tutorials` in the web app. Backend service documentation remains under `/docs`.

## Device frame sources

Frames copied from WebMobileFirst:

- https://www.webmobilefirst.com/en/mockups/apple-macbook-pro-16-2021/
- https://www.webmobilefirst.com/en/mockups/apple-imac-24-inch-2021/

Their download pages permit personal and commercial use without required attribution; standalone resale is excluded. These frames are incorporated into product mockups. Screenshots are from this repository's browser interface and fictional demo content.

## Everyday website photography

The disposable profile contains five groups of four tabs: Social (YouTube, Reddit, Instagram, LinkedIn), Work (Notion, Linear, Google Calendar, Slack), Design (Figma, Dribbble, Unsplash, Apple), Development (GitHub, Bun, React, the local Atlas Studio project), and Reading (Hacker News, MDN, Wikipedia, The Verge). Site icons are fetched before capture and stored as image data. Public websites are photographed live; no personal accounts are used. The developer workspace links the actual demo folder through production project IPC. The terminal runs the demo test. AI is an unsent planning draft with an attached brief.

The same profile also has four global Favorites: ChatGPT, Perplexity, Gemini, and Google Translate. `sidebar-expanded`, `sidebar-collapsed`, and `address-group-picker` show the same Apple page with the sidebar open, hidden, and its address-bar group picker open. Only visible native webpage layers are composited; suspended pages use the browser’s own snapshot beneath its popover.

## Current refresh workflow

From the repository root, use `npm run showcase:refresh` after starting the renderer.
Read [SHOWCASE.md](SHOWCASE.md) for the LLM runbook and verification checklist.
`atlas-studio/docs/launch-plan.md` contains reusable fictional team and launch data.
The capture includes both the solid default AI panel and the optional glassy panel.
