# Tab group terminology

A **tab group** is a sidebar item containing tabs. Use **group** in controls where the context is clear. A **tab** is an individual page, including horizontal tabs. A **space** contains groups; a **folder** organizes groups within a space. A **login profile** holds cookies and website storage; groups can share one without merging their tabs.

Use Group Settings and Group Picker for the group controls. Shared group icons live in `GroupIcon`; settings and selectors use `GroupEditor` and `GroupPicker`. Group lookup and settings helpers live in `utils/groups.ts` and `utils/groupSettings.ts`.

Existing persisted `IApp.session*` fields and browser action IDs retain their names for storage and protocol compatibility. Electron `Session` refers to browser storage, not a UI group. Do not rename these fields without a migration.
