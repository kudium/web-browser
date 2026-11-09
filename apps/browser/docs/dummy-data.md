# Browser demo workspace

Run `npm run dummy` from the repository root or `apps/browser` to open the development browser with curated real websites. Stop the command with Ctrl+C.

The command uses a dedicated **Kudium Browser Demo** profile, separate from everyday browser data. Each command launch replaces its tabs and collections with the same deterministic scenario. Reloads and development hot updates preserve edits during that run. Website cookies and login state in the demo profile are retained between launches; no credentials or accounts are seeded.

The default development server port is **1213**. Use `PORT=1214 npm run dummy` to choose another available port. Avoid running two development compilers at once: they share build output files. Stop the existing `npm run dev` before starting dummy mode.

## Screenshot and testing scenarios

- **Favorites:** Social, Work, Design, Development and Reading, with recognizable real-site icons.
- **Studio → Product Studio:** Customer Research as a folder and Product Planning as a stack, sharing collection storage.
- **Studio → Design Library:** Design Inspiration and Design System, with Mobbin, Figma-related resources, Radix and Lucide.
- **Studio → Engineering:** Frontend, Browser Platform and Release Checklist. Release Checklist has separate session storage; the other groups inherit the collection session.
- **Studio → Next Project:** empty collection for drag-and-drop and creation testing.
- **Personal → Japan 2027:** Tokyo Itinerary and separate-session Travel Bookings.
- **Personal → Reading Room:** Slow Sunday with long-form publications.
- **Daily Tools:** a standalone stack outside a collection.

There are 58 HTTPS tabs, 16 stable group identities, six collections and two spaces. The initial selection is React Documentation in Frontend. Expand a folder group to capture its nested list; hover it to capture the glass popup. Use the @slug or AI Chat button to test AI group selection. Favorites use the stacked website icons.

All destinations are public real websites. Some services show a sign-in page or cookie consent; site availability and content can change. Favicons load through Google's public favicon service. No external websites are scraped or represented as fake signed-in accounts.

The source of truth is `src/development/dummyData.ts`. Keep changes curated and deterministic so screenshot compositions and test references remain reproducible. The renderer seed is development-only and production builds exclude it. This command builds no installer and publishes nothing.
