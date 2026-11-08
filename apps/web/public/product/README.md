# Product imagery

The supplied Origin logo is copied from `/Users/samsonoyetola/workspace/Kudium/assets/icon.png`.

Homepage imagery now uses the fictional Atlas Studio demonstration workspace captured from real Kudium Browser UI. PNG originals, WebP derivatives and a verification manifest are in `demo/`. The capture script runs the production React components in Electron, real native webpage views, real project-file operations and a real terminal test. AI imagery shows an attached brief and an unsent draft; no successful assistant response is invented. Script-menu entries and hook activity are illustrative fixtures.

Reproduce with `apps/browser/.erb/scripts/demo-photography.cjs` and `apps/browser/demo/prepare-images.py`. See `apps/browser/demo/README.md` for requirements and detailed provenance.

- `browser.webp` and `workspace-detail.webp`: full browser workspace and sidebar crop.
- `assistant.webp`: AI panel crop with the real reference attachment and draft.
- `editor.webp` and `editor-detail.webp`: real file editor with meaningful demo TypeScript.
- `kudium-macbook.webp`: workspace in a MacBook frame.
- `kudium-ai-macbook.webp`: browser and AI composer in the same MacBook frame.
- `kudium-imac.webp`: editor in a teal iMac frame.

WebMobileFirst frame sources permit personal/commercial use without required attribution; standalone resale is excluded:

- https://www.webmobilefirst.com/en/mockups/apple-macbook-pro-16-2021/
- https://www.webmobilefirst.com/en/mockups/apple-imac-24-inch-2021/

Mockups fit actual captures to the display ratio with a crop, without stretching. They are presentation composites, not photographs of an app installed on those devices. Native webpage layers are captured at their real window bounds. Only explicitly allowlisted images are served; PNG masters, manifests, source frames and this README are not public endpoints.

The homepage carousel now uses full browser captures of public Apple and YouTube pages, the AI sidebar, and the linked project’s developer pages, file tree, and terminal. The demo has five groups of four tabs and real fetched site icons. Public pages are live captures, with no signed-in personal data. The AI planning draft is unsent. Integrated terminal output comes from running `bun run check` in the linked demo folder.

`favorites-detail.webp` and `address-picker-detail.webp` are focused crops of the new real sidebar and address-bar picker captures. The homepage includes an open/hidden sidebar comparison and links to dedicated Favorites and focused-browsing guides.

`demo/ai-active-tabs.webp` is a focused activity-control preview from the production `AIWorkingTabsBadge` component in Electron. The two tab titles, icons, and activity state are illustrative fixtures. The crop contains the actual popup and composer controls and excludes simulated conversation text. No live provider response is claimed. The homepage’s AI activity stage and `/tutorials/ai-active-tabs` explain the toolbar count, badge, statuses, and tab selection.
