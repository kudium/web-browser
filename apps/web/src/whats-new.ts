export const whatsNew = [
  {
    version: '1.0.27', date: '2026-11-27', title: 'Email identities, Today todos, and better AI workflows',
    highlights: [
      ['Email accounts and aliases', 'Connect multiple inboxes and forwarding-alias accounts, or associate a signed-in browser inbox with a group. The assistant can reuse aliases, fill sign-up forms, and read matching verification messages from a configured inbox.'],
      ['Today todos', 'Organize tasks in shared or group todo lists, choose dates, reorder Today, and work through the sidebar suggestion queue. Ask the assistant to add tasks to Today using the same encrypted task storage.'],
      ['Offline page translation', 'Translate supported languages with downloaded local language packs. Restore the original page and choose translation preferences for websites.'],
      ['More capable AI workflows', 'Improved tool discovery, bounded page observations, reusable browser flows, and local model controls help the assistant carry out requested work.'],
      ['Quieter browser controls', 'Lazy context menus, retained panel and editor state, more reliable tab and group movement, and compact single-line link previews improve everyday browsing.'],
    ],
  },
  {
    version: '1.0.26', date: '2026-11-25', title: 'Flexible panels and smarter address suggestions',
    highlights: [
      ['Dock panels your way', 'Move AI, Developer, hooks and other panels to the right or bottom using the compact header control. Resize the dock without losing panel content; placement and dimensions are remembered.'],
      ['More useful address suggestions', 'Find open tabs, history and search engines as you type. Compact horizontal suggestions include Chat with AI and access to command actions.'],
      ['Page Developer Tools', 'Open the inspector with Command–Option–I. Dock it right, bottom, in a separate window or in the shared panel, with resizing and stable page geometry when switching positions.'],
      ['Cleaner workspace controls', 'Space rows use the available width and reveal actions on hover. Preferences have better-sized inputs, a separate start-page preview and softer update buttons.'],
    ],
  },
  {
    version: '1.0.25', date: '2026-11-25', title: 'Faster hook access and panel history',
    highlights: [
      ['Clearer hook installation', 'Choose On matching websites to start immediately, or Only where I enable it (Auto) to opt in separately on each website. Compact, aligned controls explain both choices.'],
      ['Run hooks on the page you are viewing', 'The panel picker resolves the live current website. Enable here and run activates a website-disabled hook locally; globally disabled hooks and wildcard exclusions keep their restrictions.'],
      ['Return to previous panels', 'Back and Forward retain panel views, drafts and scroll positions. Controls hide when there is no history and keep stable sizing during navigation.'],
      ['Copy hooks your way', 'Duplicate hooks, copy global hooks to the local section, or copy local hooks to global hooks. Each copy has independent hook and action identities.'],
      ['Find your latest work', 'Developer lists sort active hooks first, then by saved edit time, including the default hook. Opening the editor selects the first sorted hook unless you requested a specific one.'],
    ],
  },
  {
    version: '1.0.24', date: '2026-11-25', title: 'Global hooks, a cleaner workspace, and clearer update feedback',
    highlights: [
      ['Run global hooks from your panel', 'Find global hooks in the panel picker, run them on the current page, or open their settings. Auto mode lets each website opt in; global disable still applies everywhere. Installed hooks can update in place, and installation remembers your selected group.'],
      ['More room for your work', 'Global and website hook editors share compact footer controls. Enable and Auto changes save immediately. Hooks can retain panel state locally and connect panel inputs and navigation to the page.'],
      ['Organize and save energy', 'Unload a group, other groups, or every group in a space; folders collapse and the toast reports how many tabs were unloaded. Drag footer space icons to reorder spaces and customize sidebar text size and backgrounds.'],
      ['A welcoming start page', 'The local welcome guide includes Dock and OS setup actions, with a cleaner footer and compact feature recommendations. Preview your Start page in Preferences, or choose a blank page or custom URL.'],
      ['Know when your update is restarting', 'Restarting for an update immediately shows progress and prevents duplicate clicks. If installation fails, the browser restores a retry action.'],
    ],
  },
  {
    version: '1.0.23', date: '2026-11-25', title: 'Panels that stay visible and easier hook discovery',
    highlights: [
      ['Keep your panel in view', 'Dialogs preserve a picture of the panel underneath and restore the same live content when closed. Unrelated popups and resizing leave the panel visible. Switching groups follows your selected tab without letting a pinned panel take over navigation.'],
      ['Make hooks work your way', 'New hooks are enabled by default and switches save immediately. Global hooks can be disabled for individual websites; global disable and removal still apply throughout their scope. Hook editors include hover-to-copy controls.'],
      ['Discover more without losing your place', 'Up to three sidebar recommendations introduce useful browser features. Explore hooks opens a new tab, while Later hides recommendations for three days. Drag collections within a space to save their order.'],
      ['See hooks before installing', 'Marketplace images use compact thumbnails and a picture viewer. Returning from the marketplace reveals the hook installer, and failed hooks report their errors without automatic alert sounds.'],
      ['Clearer account screens', 'Updated sign-in and recovery pages make errors and email verification confirmation easier to see.'],
    ],
  },
  {
    version: '1.0.22', date: '2026-11-24', title: 'Dependable panels, compact alerts, and more useful hooks',
    highlights: [
      ['Panels keep your work', 'Sidebar pages retain their content through popups and reopening, while hidden panels pause unnecessary work. Project-file dragging and browser controls are more dependable.'],
      ['Compact alerts with useful actions', 'Stacked browser toasts include countdowns, custom durations and Dismiss all. Low-battery alerts offer Save energy and can be disabled in Preferences → Performance. Activity customization can enable toasts that mark activities read when dismissed or acted on.'],
      ['More useful lifecycle hooks', 'Hooks can read battery, power, appearance, local connectivity and locale status. Shared system listeners clean up when hooks stop. A battery/toast example and illustrated guide explain the APIs.'],
      ['Cleaner hook editing and navigation', 'Examples are easier to find, Actions editors use the available height, and compact overlays keep stage navigation clear. Horizontal tabs show overflow fades and selection scrolling stays inside the tab strip.'],
      ['Local AI and autofill fixes', 'Improved Apple local-model context budgets and login intent checks, clearer autofill choices, better dropdown placement and multi-step login handling. Native passkey approval remains pending.'],
    ],
    screenshots: [
      {asset:'toast-stack',alt:'Info, warning and success browser toasts over fictional Atlas Studio content.',caption:'Production toast controls with a countdown, Dismiss all and an optional action. Renderer capture does not reproduce system backdrop blur.'},
      {asset:'toast-error',alt:'An error toast with a Try again action.',caption:'An error alert with its own action and countdown.'},
    ],
  },
  {
    version: '1.0.21', date: '2026-11-22', title: 'Clearer assistant activity and smarter form filling',
    highlights: [
      ['Stay in control of assistant tasks', 'Clearer on-page activity shows what the assistant is doing. Take control when you need to, then resume from the page banner. Requests for your input are easier to notice.'],
      ['Smarter saved-data filling', 'The assistant can find matching saved logins and form data, keeping protected values out of its context and using local authentication when required. Ask first mode retains action review.'],
      ['More dependable Apple local AI', 'Improved context management and recovery help the local assistant work within its model limits while retaining completed-action receipts.'],
    ],
  },
  {
    version: '1.0.20', date: '2026-11-21', title: 'Automatic update checks restored',
    highlights: [
      ['Update checks work again', 'This release restores automatic update checking on Apple Silicon and Intel Macs. It also includes the sign-in, autofill, and workspace improvements from 1.0.19.'],
      ['One manual installation for affected users', 'Versions 1.0.18 and 1.0.19 cannot check for updates, and their update button is disabled. Download the latest stable version from the Download page, quit Kudium Browser, replace it in Applications, and reopen it. This one-time installation restores update checks.'],
    ],
  },
  {
    version: '1.0.19', date: '2026-11-21', title: 'Smoother sign-in, more precise autofill, and workspace refinements',
    highlights: [
      ['Improved website sign-in', 'Better saved-login detection and optional automatic sign-in, including multi-step login flows and authentication before using protected credentials.'],
      ['Suggestions when you need them', 'Autofill suggestions can appear when a field receives focus, with a separate setting to keep the manual picker. Saved website accounts take priority over browser-wide profiles.'],
      ['Fill a field or a form', 'Choosing a saved value fills the focused field. Form-fill controls remain available for filling matching fields together. Personal Data preferences and website and group storage have also been refined.'],
      ['More reliable picture-in-picture', 'Automatic picture-in-picture handles switching tabs or windows more reliably, with improved playback-state detection.'],
      ['Workspace polish', 'Refinements for tabs, groups, collections, colors, and assistant activity.'],
      ['Update recovery', 'Automatic updates are unavailable in this version. Install 1.0.20 or later manually to restore update checks.'],
    ],
  },
  {
    version: '1.0.18', date: '2026-11-20', title: 'Google sign-in, privacy protection, and smarter navigation',
    highlights: [
      ['Google sign-in compatibility', 'Improved Google sign-in compatibility using the browser’s actual Chromium identity.'],
      ['Ad and tracker protection', 'Built-in EasyList and EasyPrivacy protection includes offline rules, cached updates, status, and controls for individual websites.'],
      ['Route external links', 'Choose ordered rules that open external links in your preferred spaces and groups, with a preview in Preferences.'],
      ['Copy cleaner links', 'Copy clean page and link URLs from context menus or Command/Control+Shift+C while preserving signed links and other query values.'],
      ['Automatic picture-in-picture', 'Optionally keep a playing video visible when leaving its tab, with cleanup on return and support for manually opened players.'],
      ['Diagnostics by choice', 'Usage and diagnostics default to off and require explicit opt-in on upgrade.'],
      ['Update recovery', 'Automatic updates are unavailable in this version. Install 1.0.20 or later manually to restore update checks.'],
    ],
  },
  {
    version: '1.0.17', date: '2026-11-16', title: 'A cleaner workspace, dependable project tools, and resource controls',
    highlights: [
      ['Refined spaces and favorites', 'Compact favorites with subtle depth, website-colored active borders, clearer group containment, and a space search that preserves favorites and filters matching tabs.'],
      ['Reliable folder drops', 'Drop a folder into Developer to link the current group and open its terminal. Sidebar drops reuse the Create group editor and save the name, pages, selected space, and project folder.'],
      ['Task Manager', 'Inspect live CPU and memory, filter and sort activities, and use row actions to stop pages, close tabs, or force-end eligible processes.'],
      ['Notes that stay readable', 'Wrapped titles, a separate visual/Markdown view control, quieter settings, production editor loading fixes, and local recovery for failed panels.'],
      ['Better everyday browsing', 'Fast recent-tab switching, latest-chat scrolling, compact space controls, improved website color detection and caching, and browser identity based on the actual runtime.'],
      ['More useful autofill', 'Whole-form filling includes saved email fields, empty autofill actions stay hidden, and browsing saved data can fall back from a website to group and shared records.'],
    ],
    screenshots: [
      { asset: 'space-search', alt: 'Find matching tabs in a real website workspace.', caption: 'Real public websites, filtered by space search.' },
      { asset: 'notes-workspace', alt: 'Atlas Studio launch note in the updated editor.', caption: 'A fictional Atlas Studio checklist in the real visual editor.' },
      { asset: 'task-manager', alt: 'Live resource metrics in Task Manager.', caption: 'Actual browser processes and page resource measurements.' },
    ],
  },
  {
    version: '1.0.15',
    date: '2026-11-15',
    title: 'Quieter sync and smarter media controls',
    highlights: [
      ['Smarter music controls', 'Sidebar controls distinguish sustained playback from muted loops and brief website effects, with cached media detection that reduces background work.'],
      ['More efficient account sync', 'Changed browsing data syncs promptly while remote checks slow down when idle. Unchanged saved data avoids repeated reads, and failed uploads retry with increasing delays.'],
      ['Simpler agent reconnects', 'Connecting Hermes or OpenClaw refreshes the browser connection and removes duplicate local entries, including the previous Touchbox name.'],
      ['Recognizable hook publishers', 'Marketplace packages support unique publisher usernames, shown in install previews when provided by the marketplace.'],
      ['Optional form tools', 'Unchanged bundled Form tools are retired; customized and installed hooks are preserved. Install the optional Form tools package from the marketplace to keep these actions.'],
    ],
  },
  {
    version: '1.0.14',
    date: '2026-11-15',
    title: 'Personal data across your devices',
    highlights: [
      ['Sync personal data', 'Enable Personal details, forms & documents in Sync settings, then unlock and sync saved information from your groups, including logins and attached documents.'],
      ['Choose where to save', 'The personal data editor lets you save an item browser-wide or in a specific group, including customizations of shared items.'],
      ['Clearer saved fields', 'Choosing a field type now supplies a matching name when the field is unnamed, making saved personal data easier to recognize.'],
    ],
  },
  {
    version: '1.0.13',
    date: '2026-11-14',
    title: 'Music controls that stay within reach',
    highlights: [
      ['Music in your sidebar', 'A compact floating player above the space footer lets you pause, resume and mute background media. The website icon shows an animated sound indicator, and clicking the player or icon returns you to its tab.'],
      ['A steadier player', 'The player hides when you return to the music tab and stays steady during quick tab switches. Dismiss it until your next visit to the source tab.'],
      ['More room for spaces', 'The add-space button appears when you hover over the footer, leaving more room for your spaces the rest of the time.'],
      ['Browser reliability improvements', 'Updated dependencies and fixes improve autofill matching, update handling and developer tools.'],
    ],
  },
  {
    version: '1.0.11',
    date: '2026-11-14',
    title: 'More flexible autofill and a smoother browser',
    highlights: [
      ['Choose your saved values', 'Personal Data now offers Browse saved data even when a field has no suggested matches. Search profiles, field names and values, then choose a value to fill just the focused field.'],
      ['More reliable website icons', 'Improved favicon discovery, decoding and fallbacks help website icons appear consistently in tabs, the tab switcher and Activity.'],
      ['Clearer active groups and loading', 'Collapsed folder-style tab groups use a subtle background to show the active group. Late-loading embedded content no longer makes a loaded page look as though it is reloading.'],
      ['Better developer tools and hooks', 'Improved code suggestions, hook authoring and marketplace tools make it easier to build and manage website enhancements.'],
      ['Browser reliability improvements', 'Updates to extension compatibility, private browsing, assistant context and account sync improve everyday browsing.'],
    ],
  },
  {
    version: '1.0.10',
    date: '2026-11-13',
    title: 'Hooks with actions and a more capable assistant',
    screenshots: [
      { asset: 'site-hooks-light', alt: 'Atlas Studio website hook editor with saved script and run output', caption: 'Edit and run website hooks from the developer workspace.' },
      { asset: 'ai-context', alt: 'Kudium assistant with an unsent draft and Atlas Studio project references', caption: 'Bring browser tabs and project files into an assistant task.' },
    ],
    highlights: [
      ['Hooks with actions', 'Build reusable hooks with editable actions, test them on a website, and manage general hooks from Settings. Form actions can use your saved personal data, with review before submission.'],
      ['Apple local AI', 'Use the Apple local AI provider on supported Macs, with clearer prerequisite guidance and browser context management.'],
      ['A more useful assistant', 'Adjust thinking effort, manage context, and ask AI to help author hooks. Loop guards help tasks recover when progress stalls.'],
      ['Workspace polish', 'Updated space icons and colors, form controls, password authentication, history suggestions and website appearance settings make everyday browsing smoother.'],
      ['One place for release notes', 'The browser’s What’s New button now opens this website page in a new tab in your current group, linking directly to your installed version.'],
    ],
  },
  {
    version: '1.0.9',
    date: '2026-11-12',
    title: 'A hooks marketplace and a smoother workspace',
    highlights: [
      ['Discover and share hooks', 'Browse the public hooks marketplace, search by name or website, and publish your saved hooks with your Kudium account. Install from a link, review the code before saving, and choose a group or All groups for general hooks. Imports stay disabled until you enable them, and updates require your review.'],
      ['A clearer developer workspace', 'Get Hooks and Publish are now easy to find. The hook editor and publishing forms fit smaller windows, with actions kept within reach. Linked projects update immediately, terminal URLs open in new tabs, and run scripts can be imported from project files across more languages.'],
      ['A simpler account dashboard', 'The web dashboard has a compact header with My hooks and Publish hook actions. The marketplace supports likes and native comments, and the What’s New page is easier to reach from the website.'],
      ['More capable website hooks', 'Use one Examples picker to try useful page enhancements or insert their code. Save & Run, script history, cleanup on navigation, and JavaScript suggestions make hooks easier to build and maintain. Ask AI to help set up or repair a hook, then review its changes.'],
      ['Activity that gets your attention', 'Choose a notification sound, preview it, and optionally enable system banners. Hook-created activity shows its website icon and a shortcut back to the developer tools. Clear all entries from the Activity page.'],
      ['Project files in AI chat', 'Reference a file from its context menu or type / to find skills and files in your group’s linked folder. AI can open project files in browser tabs. The chat header now includes a Developer shortcut, with tidier model and access controls.'],
      ['Better file previews', 'HTML files now have syntax highlighting, including embedded CSS and JavaScript. Toggle line wrapping in the editor and pinch to zoom images and PDFs. Opening a preview keeps the file list steady, and project files use native file dragging.'],
      ['Notes that fit your workspace', 'Filter notes by group from the search-row filter button, and create new notes in the selected group. Pinned lists stay compact, while selecting a note in a narrow panel reveals its editor. Note wrapping is remembered.'],
      ['Make each space your own', 'Set the frame tint and primary accent together or choose them separately in Manage Space. Rename a space, change its icon, and reach workspace preferences from the same dialog. The app remembers your last space, group and tab unless startup settings override them.'],
      ['Polish throughout the browser', 'Downloads animate toward the footer after saving, with a clearer progress ring. Developer page rows show site icons and shorter addresses. A What’s New button appears after an update.'],
    ],
  },
  {
    version: '1.0.7',
    date: '2026-11-11',
    title: 'A cleaner workspace, more useful developer tools',
    highlights: [
      ['Easier groups', 'Create a group beside Add tab, paste a list of website URLs, and choose Folder or Stack from visual examples.'],
      ['Preview more project files', 'View images, PDFs, video, audio, Markdown, CSV, TSV and JSON. Open files as browser tabs, or run a configured folder script in the built-in terminal.'],
      ['Useful website hooks', 'Try dark mode, accent colors, auto-scroll, image URL labels and other ready-to-use examples. Pages with hooks now stay in sync across the developer interface.'],
      ['Activity you can trace', 'Click the Page hook badge to return to the triggering hook. Disable it from the activity action buttons on hover.'],
      ['Small improvements throughout', 'Search with AI from Find on page, use the browser options menu, and enjoy tidier tab previews and full-height AI chat history.'],
    ],
  },
] as const;
