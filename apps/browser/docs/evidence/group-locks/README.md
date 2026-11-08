# Group locks

- Group tooltip includes a truncated `@slug`; the shared hover preview uses a single-line ellipsis.
- Group menu offers Lock group, Unlock group, Lock now, and Remove group lock as applicable.
- Protection uses stable group identity, independently of shared login profiles.
- Native OS authentication is reused from Personal Data. The current adapter supports macOS; other devices cannot enable group protection yet. Actual system prompt appearance was not exercised by this fixture.
- Grants exist only in memory for the browser process. Restart, OS lock, suspend, and manual relock revoke access. Renderer reload preserves it.
- Protection unloads live pages, popups, and pending child pages. Group settings share the access gate. Commands, forged page layouts, and AI/MCP access cannot open protected pages.
- Group names, icons, and references remain discoverable. Existing cookies, history, downloads, and past AI conversations retain their independent storage rules; group locking does not add encryption to these records.

Verification uses a disposable Electron profile with a simulated authentication adapter and local web pages. Tests exercise cancellation, duplicate prompts, persisted protection versus ephemeral grants, group isolation, conservative backup recovery, lock/suspend revocation, editor hiding, and mutation denial. Real MCP calls verify locked tabs are absent and `read_page` is denied. Light/dark captures verify the locked page; a narrow hover capture checks a long reference stays inside the window.

Run after `npm run build`:

```sh
./node_modules/.bin/electron .erb/scripts/browser-ui-smoke.cjs --group-locks-only
npx jest --runInBand src/__tests__/groupLocks.test.ts src/__tests__/groupAccessGate.test.tsx
```
