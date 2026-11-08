# Command discovery and group portability

Uses the hierarchy, neutral controls and progressive disclosure from `Design.md` and `docs/ui-design.md`.

Command palette Electron fixtures cover matching group/folder/tag suggestions, explicit `@slug`, Tab group scope, filtered tabs, and creating a URL in that group at 760px and 360px, in light and dark appearance. The fixture verifies the created tab's group and space in saved storage.

Group settings fixtures cover 620px and 360px, light/dark, collapsed/expanded settings, and the export row's visible, pending and error states. Viewport bounds are now checked alongside horizontal overflow and fixed footer reachability; visual inspection found and corrected a narrow dialog that extended beyond the viewport.

Native Search With menus retain existing editing, lookup, sharing, extension and inspection actions. Tests verify selected text encoding. Import/export uses Electron's native file pickers and confirmation dialog; these OS surfaces were not manually visually inspected. Transfer tests verify cancellation, hook disclosure, fresh profiles, disabled hook imports, hook source preservation and malformed-file rejection.

Exports carry saved pages, page names/pins/default URLs, group name/slug/emoji/home page and per-origin developer hooks. Cookies, credentials, permissions, local project folders and terminal authority are not carried. Imported hooks remain disabled until reviewed in Developer.

## Compact command panel
Removed the legacy `!important` outer padding that defeated the unified header layout. The search header now stays transparent while focused; the panel uses one separator, 48px rows, smaller icons, flat keyboard hints and a neutral footer. Group details no longer repeat the Tab instruction on every row. The Tab hint appears on the focused row and in the footer. Group scope uses a short placeholder because the group name is already visible in its chip.

Reviewed empty/full results with long names, name matching, explicit slug search, scoped groups, filtered tabs, URL creation and tags at 760px and 360px in light/dark appearance (28 Electron fixture states). Layout checks verify viewport containment, zero outer padding, a transparent focused field, header height and row height. Keyboard regression tests select the tab suggestion by its meaning rather than a fixed position, because group suggestions precede navigation suggestions.
