# Default browser banner and external link destinations

Preferences displays a neutral banner when the OS reports that Kudium Browser is not the default handler for both HTTP and HTTPS. Its Make default action reuses the existing registration adapter. The banner stays visible while confirmation is required, replaces its supporting line with actionable feedback, and disappears only after a confirmed default status. Preferences refreshes status on focus.

Links arriving through open-url, second-instance, and startup arguments now request an active-group destination in the renderer. The existing commandDestination helper resolves the URL within the active group; matching URLs in other groups cannot redirect the destination. New tabs inherit the group's login profile, name, icon, home, placement, folder and AI reference. A matching tab within that group is selected. When there is no active group, the first URL creates one and subsequent queued URLs share it. Configured startup-page behavior is preserved separately.

Verification:

- Six focused Settings and navigation tests passed, including confirmation feedback and focus refresh.
- Native production-renderer smoke verifies two queued links, same URL in another group sharing a login profile, group metadata preservation, existing-tab reuse, unsupported schemes, and an empty-workspace burst.
- Banner reviewed at 1080px and 480px in light/dark, including wrapping, focused controls, visible confirmation feedback, and disappearance after confirmed registration. Layout checks assert banner/action bounds and no document overflow.
- TypeScript, targeted ESLint and production build passed.

Run after building:

```
KUDIUMBROWSER_SMOKE_OUTPUT=docs/evidence/default-browser node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .erb/scripts/browser-ui-smoke.cjs --external-links-only
```

Fixtures use disposable storage and local HTTP pages. OS default-browser detection and registration are stubbed; this run does not change the user's default browser. Actual OS confirmation UI and delivery by a separate external application were not exercised. External link routing is tested through the same main-to-renderer request used by those handlers. Loading/disabled presentation is implemented but not captured in these screenshots.
