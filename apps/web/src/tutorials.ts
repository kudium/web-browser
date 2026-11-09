export type Tutorial = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  path: string;
  steps: [string, string][];
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
  note?: string;
};
export const tutorials: Tutorial[] = [
  {
    slug: "first-workspace",
    title: "Your first workspace",
    category: "Start here",
    summary: "Give your everyday browsing a little structure.",
    path: "Sidebar → New tab · Space menu → Create Group…",
    image: "workspace-light",
    steps: [
      [
        "Open a page",
        "Choose New tab or press Command+T on macOS (Control+T on Windows/Linux). Enter a URL or search term.",
      ],
      [
        "Create a group",
        "Open the space context menu and choose Create Group…. Name it for a project, such as Atlas Studio.",
      ],
      [
        "Add related tabs",
        "Right-click a tab and choose New Tab in This Group…. Add your project brief, research and preview.",
      ],
      [
        "Switch between pages",
        "Select a group in the sidebar, then choose its horizontal tab. Use Control+Tab to move to the next tab.",
      ],
    ],
  },
  {
    slug: "spaces-and-groups",
    title: "Spaces, groups and separate logins",
    category: "Everyday browsing",
    summary: "Keep work and personal browsing easy to find.",
    path: "Sidebar → Create space · Group context menu",
    image: "workspace-dark",
    steps: [
      [
        "Create a space",
        "Use Create space in the sidebar. Give the space a name and color.",
      ],
      [
        "Organize the space",
        "Use the space menu to create a collection, then gather related groups inside it. Choose Folder or Stack from a group’s context menu to change how it appears.",
      ],
      [
        "Choose the login deliberately",
        "Groups in a collection can share its login session. Choose a separate session for a group when you need another account; moving or changing the group’s display does not change its existing login.",
      ],
      [
        "Manage later",
        "Open Settings → Workspace to manage groups, spaces and archived tabs.",
      ],
    ],
  },
  {
    slug: "sidebar-and-group-picker",
    title: "Focus with the sidebar hidden",
    category: "Everyday browsing",
    summary: "Give the page more room and switch groups from the address bar.",
    path: "Browser toolbar → Hide sidebar · Address bar → Switch group",
    image: "address-group-picker",
    steps: [
      [
        "Hide the sidebar",
        "Click Hide sidebar in the top toolbar. The address bar moves into the header and shows the name of your current group beside the URL.",
      ],
      [
        "Open the group picker",
        "Click the group name beside the URL to open Switch group. Your groups appear with their icons and space names.",
      ],
      [
        "Choose your next context",
        "Search for a group or select it from the list. Use the arrow keys and Enter to choose with the keyboard. Its tabs appear in the horizontal tab strip.",
      ],
      [
        "Bring the sidebar back",
        "Click Show sidebar in the toolbar to return to your Favorites and pinned groups. You can also right-click the sidebar control to choose Expanded, Compact, or Hidden sidebar.",
      ],
    ],
  },
  {
    slug: "favorites-and-pinned-groups",
    title: "Favorites and pinned groups",
    category: "Everyday browsing",
    summary:
      "Keep your daily tools across spaces and pin project groups where they belong.",
    path: "Group context menu → Group Settings… → Organization → Placement",
    image: "sidebar-expanded",
    steps: [
      [
        "Choose a daily essential",
        "Create or select a group for a tool you use often, such as ChatGPT, Perplexity, Gemini, or Google Translate.",
      ],
      [
        "Make it a Favorite",
        "Right-click the group and open Group Settings…. Expand Organization and set Placement to Favorite, then save. It appears as an icon tile at the top of the sidebar.",
      ],
      [
        "Pin a project group",
        "For a work or project group, set Placement to Pinned instead. Choose its space in Organization. Pinned groups stay in that space; Favorites remain available when you change spaces.",
      ],
      [
        "Arrange your essentials",
        "Drag your favorite tiles to reorder them. Click a tile to return to the group, and use the horizontal tab strip for its pages. Keep a few daily essentials in Favorites so the section stays easy to scan.",
      ],
    ],
  },
  {
    slug: "tabs-and-archive",
    title: "Find, pin and recover tabs",
    category: "Everyday browsing",
    summary: "Keep important pages close and recover a closed tab.",
    path: "Tab context menu · Settings → Workspace → Archive",
    steps: [
      [
        "Search or navigate",
        "Press Command+L (Control+L) to open the address bar. Use a URL, search query or a matching saved page.",
      ],
      [
        "Use group controls",
        "Right-click a group to inspect its pin and favorite actions. Pin a project you return to often.",
      ],
      [
        "Close a tab",
        "Right-click the horizontal tab and choose Close Tab, or use Command+W (Control+W).",
      ],
      [
        "Recover it",
        "Use Command+Shift+T (Control+Shift+T) to reopen a closed tab. Open Archive for older archived pages.",
      ],
    ],
  },
  {
    slug: "ai-assistant",
    title: "Ask with your browsing context",
    category: "AI",
    summary: "Bring pages and projects into a useful conversation.",
    path: "Settings → AI assistant · Browser → Assistant",
    image: "ai-context",
    steps: [
      [
        "Connect a model",
        "Open Settings → AI assistant and configure a supported model connection. Keep provider credentials private.",
      ],
      [
        "Open the assistant",
        "Select the Assistant panel from the browser tools. Start a new conversation for your project.",
      ],
      [
        "Attach relevant context",
        "Use the composer’s context controls to choose the page or group you want the assistant to use. Review attachments before sending.",
      ],
      [
        "Ask a focused question",
        "Try: “Summarize the project brief and suggest an accessibility checklist.” Review the response against the source page.",
      ],
    ],
    note: "A configured model is required. Demo photography does not fabricate a successful live AI response.",
  },
  {
    slug: "ai-active-tabs",
    title: "Track the tabs AI is working on",
    category: "AI",
    summary: "See AI activity, inspect the working tabs, and jump straight to a page.",
    path: "Browser → AI button → Assistant → Active AI tabs",
    image: "ai-active-tabs",
    imageAlt: "Kudium’s AI activity popup with two sample tabs, their icons, an Active now indicator, and the animated-border badge above the input",
    imageCaption: "Actual activity controls with two illustrative sample tabs. Click to enlarge.",
    steps: [
      ["Watch the AI button", "While AI works with pages, the existing AI button in the browser toolbar shows a count of tabs used in the current run. Select it to open the AI panel, then choose Assistant."],
      ["Open Active AI tabs", "Above the Assistant input, select the Active AI tabs badge. Its animated color border and spinner indicate activity. The popup lists tab icons and titles."],
      ["Read each tab’s status", "Active now marks the page AI is currently using. Used in this run marks a page it has already worked with during this run. The count includes both; it does not mean every listed page is being used simultaneously."],
      ["Jump to a working page", "Select a tab row to open that page and close the popup. The list follows AI activity and clears when the run finishes or AI hands control back."],
    ],
    note: "The illustration uses sample activity, not a live AI response. With reduced motion enabled, the border and spinner stay still. Only tabs the AI has used appear here; this is not a list of every tab it can access.",
  },
  {
    slug: "ai-permissions",
    title: "Control what an agent can access",
    category: "AI",
    summary: "Review access before an assistant changes your workspace.",
    path: "Settings → AI assistant → External AI",
    steps: [
      [
        "Open External AI",
        "Go to AI assistant settings and open External AI. Read the current access mode and scope.",
      ],
      [
        "Connect your agent",
        "Use the connection instructions shown in the app. Keep connection tokens out of repositories and screenshots.",
      ],
      [
        "Review requested actions",
        "Check the group, site, files or command involved when the browser presents an approval.",
      ],
      [
        "Disconnect when finished",
        "Use the app’s connection and permission controls to remove access you no longer need.",
      ],
    ],
  },
  {
    slug: "developer-project",
    title: "Connect your project",
    category: "Developer",
    summary: "Bring a local project alongside its browser preview.",
    path: "Browser tools → Developer → Link project folder",
    image: "project-files-light",
    steps: [
      [
        "Open Developer",
        "Open the browser tools and switch to Developer. Select the group containing your local preview.",
      ],
      [
        "Link the folder",
        "Use the project-folder control and choose your project directory. For the demo, choose apps/browser/demo/atlas-studio.",
      ],
      [
        "Confirm the project",
        "Check the displayed name and path. Keep the project attached to the intended group.",
      ],
      [
        "Explore the tools",
        "Use Files to browse the project, Scripts for saved commands, and Terminal for a shell in the linked folder.",
      ],
    ],
  },
  {
    slug: "file-manager",
    title: "Browse and manage project files",
    category: "Developer",
    summary: "Navigate folders and find exactly the file you need.",
    path: "Developer → Linked project → Files",
    image: "project-files-light",
    steps: [
      [
        "Open Files",
        "Link a project folder, then choose Files in Developer. The file tree shows the project’s files and directories.",
      ],
      [
        "Navigate folders",
        "Open a folder in the tree. Use the breadcrumbs to return to a parent directory.",
      ],
      [
        "Filter the listing",
        "Type a filename in Filter files. This filters loaded folders; it is not a full-text search across every file. Clear it to restore the listing.",
      ],
      [
        "Manage an item",
        "Right-click a file or folder to see the available create, rename, duplicate and delete actions. Check the selected path before confirming.",
      ],
      [
        "Refresh after external changes",
        "Use Refresh files after modifying the project in another editor.",
      ],
    ],
    note: "File operations affect your real linked project. Try unfamiliar operations in the supplied demo folder first.",
  },
  {
    slug: "file-filtering",
    title: "Find a file without losing your place",
    category: "Developer",
    summary: "Use filename filtering and folder navigation together.",
    path: "Developer → Files → Filter files",
    image: "file-filter",
    steps: [
      [
        "Choose a folder",
        "Navigate to the directory containing the files you want to inspect.",
      ],
      [
        "Enter part of a name",
        "Type README or app in Filter files. Compare the visible results with your current folder.",
      ],
      [
        "Open a match",
        "Choose a result to preview it. Editable text files open in the built-in editor.",
      ],
      [
        "Return to the listing",
        "Use Back to folder, then clear the filter to see the other files.",
      ],
    ],
  },
  {
    slug: "edit-and-save",
    title: "Edit, save and handle conflicts",
    category: "Developer",
    summary: "Make a small change with clear feedback before it reaches disk.",
    path: "Developer → Files → Select a text file",
    image: "project-editor-light",
    steps: [
      [
        "Open a text file",
        "Choose src/app.ts in the demo project. The editor shows the file with syntax highlighting.",
      ],
      [
        "Make a small change",
        "Edit a comment or label. Check the unsaved state before moving away.",
      ],
      [
        "Save deliberately",
        "Choose Save. Confirm that the editor reports the saved state.",
      ],
      [
        "Handle unsaved navigation",
        "When asked whether to save changes, choose Save, Discard or Cancel based on whether you want to keep the edit.",
      ],
      [
        "Resolve a disk conflict",
        "If another program changed the file, preserve your edits and compare the disk version before retrying. Do not overwrite blindly.",
      ],
    ],
  },
  {
    slug: "scripts-and-terminal",
    title: "Run your project from the browser",
    category: "Developer",
    summary: "Save useful commands and inspect their actual output.",
    path: "Developer → Linked project → Scripts / Terminal",
    image: "project-scripts",
    steps: [
      [
        "Check the project directory",
        "Confirm the linked project before opening a terminal or running a script.",
      ],
      [
        "Open Scripts",
        "Choose Scripts → Manage scripts…. Add a descriptive name and a command such as bun run dev.",
      ],
      [
        "Choose the scope",
        "Save a command for this project or all projects. Commands must exist in the project’s environment.",
      ],
      [
        "Run and inspect",
        "Run the saved script and inspect the terminal output. For Atlas Studio, bun run dev serves http://127.0.0.1:4178.",
      ],
      [
        "Verify a change",
        "Run bun run check for the demo’s progress calculation, then refresh the preview. Stop the development process when finished.",
      ],
    ],
    note: "Scripts execute shell commands with your user’s access. The photography script seeds the script menu; it does not claim those commands ran.",
  },
  {
    slug: "project-terminal",
    title: "Check a project in the terminal",
    category: "Developer",
    summary:
      "Run a real check and read the result without leaving the browser.",
    path: "Developer → Linked project → Terminal",
    image: "project-terminal",
    steps: [
      [
        "Open Terminal",
        "Link the Atlas Studio demo folder and open Terminal from its project controls. Confirm the current directory.",
      ],
      [
        "Run the check",
        "Enter bun run check. The demo runs one test for the project progress calculation.",
      ],
      [
        "Read the result",
        "Look for 1 pass and 0 fail. If Bun is not installed, install it before running the demo.",
      ],
      [
        "Manage terminal sessions",
        "Use New terminal for a separate shell. Use the terminal actions to inspect available rename, restart and close controls. Stop any server process before closing your session.",
      ],
    ],
  },
  {
    slug: "website-hooks",
    title: "Customize a website with hooks",
    category: "Developer",
    summary: "Apply trusted JavaScript or CSS and inspect its activity.",
    path: "Developer → Group pages → Manage hooks for a page",
    image: "site-hooks-light",
    steps: [
      [
        "Select the page",
        "In Developer, find the page under Group pages and open its Manage hooks control.",
      ],
      [
        "Choose a stage",
        "Use Before load for early setup, After load for DOM work, or CSS for styling.",
      ],
      [
        "Start with a small example",
        'In After load, enter log("Page ready", document.title);. For CSS, add a visible focus outline.',
      ],
      [
        "Enable and save",
        "Turn on Manage this site, save your changes, and reload the target page.",
      ],
      [
        "Inspect activity",
        "Check the hook status and activity output. Disable the hook if it produces errors or unwanted changes.",
      ],
    ],
    note: "Hooks apply to the website in the group’s login session. They run while the page is loaded, in an isolated world with DOM access and no Node.js access. Enable only code you trust.",
  },
  {
    slug: "history-downloads-capture",
    title: "History, downloads and page capture",
    category: "Everyday browsing",
    summary: "Return to a page or keep a useful reference.",
    path: "Browser menu → History / Downloads · Page capture controls",
    steps: [
      [
        "Open history",
        "Use the browser menu’s History action or Command+Y (Control+Y). Search for a page and open it.",
      ],
      [
        "Find a download",
        "Open Downloads using Command+J (Control+J). Inspect its state and use the available file actions.",
      ],
      [
        "Capture a page",
        "Open the browser’s capture controls and choose the available visible-page, full-page or area option.",
      ],
      [
        "Check the result",
        "Review the capture and save location. A screenshot may contain private page content; check it before sharing.",
      ],
    ],
  },
  {
    slug: "preferences",
    title: "Make the browser feel like yours",
    category: "Settings",
    summary: "A map of the browser’s preference pages.",
    path: "Browser menu → Settings…",
    steps: [
      [
        "Browsing basics",
        "Search engine chooses search behavior. Startup controls restoration and startup pages. Appearance adjusts browser presentation. Keyboard shortcuts customizes bindings.",
      ],
      [
        "Website behavior",
        "Websites covers JavaScript, images, autoplay and site zoom. Privacy & security covers access and site data. Network and Compatibility cover their respective connection settings.",
      ],
      [
        "Your workspace",
        "Workspace manages groups, spaces and archive. Downloads configures saving. Performance configures sleeping tabs and exceptions. Languages controls spelling assistance.",
      ],
      [
        "Connections and tools",
        "AI assistant manages models, skills and agent connections. Extensions manages extension scope. Personal Data holds supported local personal records. Developer exposes developer preferences. About shows browser and engine information.",
      ],
    ],
  },
  {
    slug: "personal-data-extensions",
    title: "Personal data and extensions",
    category: "Settings",
    summary: "Keep account details and extension access intentional.",
    path: "Settings → Personal Data / Extensions",
    steps: [
      [
        "Open Personal Data",
        "Inspect supported login, profile, payment and knowledge sections. Use fictional entries when demonstrating these screens.",
      ],
      [
        "Review local protection",
        "Use the app’s available authentication controls before revealing sensitive values. Never photograph real passwords or recovery material.",
      ],
      [
        "Manage extensions",
        "Open Extensions and inspect installed entries and their permissions.",
      ],
      [
        "Choose extension scope",
        "Apply an extension only to the groups that need it, or use the all-groups option deliberately.",
      ],
    ],
  },
  {
    slug: "sync-and-updates",
    title: "Sync your browser across devices",
    category: "Settings",
    summary: "Connect your Kudium account and protect your synced browsing data.",
    path: "Preferences → Sync",
    steps: [
      ["Connect your account", "Open Preferences → Sync → Connect account. Sign in on browser.kudium.com, compare the device code with Preferences, and approve only a connection you started."],
      ["Save your recovery key", "On your first device, save the recovery key in your password manager, confirm that you saved it, and select Start encrypted sync. On another device, sign in and enter that same key. Kudium’s server cannot recover the key."],
      ["Choose what to sync", "Select workspace organization, open tabs, portable browser preferences, and optional Kudium saved passwords. Unlock Personal Data and choose Sync saved passwords to upload logins; restore them explicitly on another device. Sync uploads encrypted per-device snapshots periodically. You can pause sync or disconnect at any time."],
      ["Continue on another device", "Use Sync now to refresh. Choose Restore as new groups for another device’s workspace, or Use preferences to apply its portable preferences. Existing local tabs are kept."],
    ],
    note: "This flow requires the updated desktop build and the deployed device-authorization backend. iCloud is a separate integration and remains unavailable. Apple iCloud Passwords requires Apple approval for Kudium. Group-only credentials, passkeys, cookies, AI API keys, and AI chat history remain local.",
  },
];

// Individual guides for every preference section and additional AI workflows.
const settingsGuides: Tutorial[] = [
  {
    slug: "search-engines",
    title: "Choose and customize search",
    category: "Settings",
    summary: "Use your preferred search service from the address bar.",
    path: "Settings → Search engine",
    steps: [
      [
        "Choose the default",
        "Open Search engine and select the engine used for address-bar queries.",
      ],
      [
        "Add a service",
        "Choose Add search engine. Enter its name, shortcut and search URL in the form. Use the format shown by the app.",
      ],
      [
        "Save and try it",
        "Choose Save search engine, then enter a short query in a new tab. Confirm the query opens on your chosen service.",
      ],
      [
        "Review entries",
        "Use the engine manager to edit or remove entries. Deleting the default selects another available engine.",
      ],
    ],
  },
  {
    slug: "appearance",
    title: "Adjust the browser layout",
    category: "Settings",
    summary: "Put the address bar and tab controls where they work for you.",
    path: "Settings → Appearance",
    steps: [
      [
        "Choose a layout",
        "Select Address bar position: Sidebar or Header above tabs.",
      ],
      [
        "Adjust visibility",
        "Review Unpinned groups, folder hover previews, pinned extension icons and Smart tab customizations.",
      ],
      [
        "Choose comfortable text",
        "Set Default page zoom and Default font size. Website-specific styles can override font defaults.",
      ],
      [
        "Review the result",
        "Open a page and compare the layout. Glassy sidebar and frame is a macOS setting; system transparency and contrast preferences can use solid backgrounds.",
      ],
    ],
  },
  {
    slug: "startup",
    title: "Choose what opens on launch",
    category: "Settings",
    summary: "Restore your workspace or begin with selected pages.",
    path: "Settings → Startup",
    steps: [
      [
        "Choose On startup",
        "Select Restore saved workspace or Open selected pages. Saved groups remain available either way.",
      ],
      [
        "Set startup pages",
        "If you choose selected pages, enter the URLs in Startup pages.",
      ],
      [
        "Set the default browser",
        "Choose Make default browser and follow your operating system’s confirmation flow.",
      ],
      [
        "Check a fresh launch",
        "Quit normally and reopen the browser. Confirm that the selected startup behavior matches your choice.",
      ],
    ],
  },
  {
    slug: "sleeping-tabs",
    title: "Reduce memory with sleeping tabs",
    category: "Settings",
    summary: "Keep tabs saved while unloading long-idle pages.",
    path: "Settings → Performance",
    steps: [
      [
        "Enable sleeping tabs",
        "Turn on Save memory with sleeping tabs. Choose an idle duration from 1 to 1440 minutes.",
      ],
      [
        "Set exceptions",
        "Choose whether pinned and favorite tabs should remain awake. Review site exclusions.",
      ],
      [
        "Check a sleeping tab",
        "Leave an eligible hidden page idle, then select it again. Its saved tab remains and the page reloads when selected.",
      ],
      [
        "Review rendering options",
        "Hardware acceleration requires a restart. Read the Energy saver control’s description before changing it.",
      ],
    ],
    note: "Visible split-view panes, editors, media, downloads and pages with unload warnings are protected from sleeping.",
  },
  {
    slug: "website-behavior",
    title: "Set behavior for individual websites",
    category: "Settings",
    summary: "Control JavaScript, images, autoplay and site-specific rules.",
    path: "Settings → Websites",
    steps: [
      [
        "Review browser defaults",
        "Inspect Website JavaScript, Website images and Website autoplay before changing them.",
      ],
      [
        "Add a site rule",
        "Enter the website origin in New site origin. Include the scheme and hostname, such as https://example.com.",
      ],
      [
        "Adjust that site",
        "Review its JavaScript, images, autoplay, popups, zoom and user-agent controls.",
      ],
      [
        "Save and verify",
        "Save the settings and reopen or reload the target page. Return to the rule if the site behaves unexpectedly.",
      ],
    ],
  },
  {
    slug: "privacy-settings",
    title: "Review website privacy controls",
    category: "Settings",
    summary: "Make deliberate choices about permissions, cookies and tracking.",
    path: "Settings → Privacy & security",
    steps: [
      [
        "Choose website access",
        "Set Website permissions to Ask every time or Block all requests. Review whether sites may open popup tabs.",
      ],
      [
        "Review HTTP cookies",
        "Choose an HTTP cookie policy and add origin exceptions only where needed. This controls HTTP headers; it does not block document.cookie or all local storage.",
      ],
      [
        "Review tracking and referrers",
        "Basic tracking protection blocks a small built-in list. Set Tracking exceptions and Referrer headers as needed.",
      ],
      [
        "Inspect storage",
        "Choose a login/group scope and use Inspect session storage to inspect its storage state.",
      ],
      [
        "Consider clear on exit",
        "Clear website data on exit runs after a normal Quit, retains extension storage and cannot clean up after forced termination.",
      ],
    ],
    note: "Basic tracking protection is not a comprehensive ad blocker. WebRTC restrictions can affect calls.",
  },
  {
    slug: "network-settings",
    title: "Configure DNS and proxy settings",
    category: "Settings",
    summary: "Adjust connections for your browser and selected groups.",
    path: "Settings → Network",
    steps: [
      [
        "Choose Secure DNS mode",
        "Automatic with fallback can use system DNS. Secure only requires your chosen provider.",
      ],
      [
        "Choose a DNS provider",
        "Select the system configuration, a listed provider or a Custom endpoint. Custom endpoints must use HTTPS DNS-over-HTTPS POST.",
      ],
      [
        "Choose proxy scope",
        "Check whether you are configuring browser defaults or a group/login override. Enter the proxy or PAC details shown by your network administrator.",
      ],
      [
        "Apply and check",
        "Save, then open a known page. Use the available diagnostics if it does not load. Remove an unnecessary group override with Use browser defaults.",
      ],
    ],
  },
  {
    slug: "compatibility",
    title: "Manage user-agent overrides",
    category: "Settings",
    summary: "Use a targeted override when a website needs it.",
    path: "Settings → Compatibility",
    steps: [
      [
        "Select the scope",
        "Choose browser defaults or the intended group/login.",
      ],
      [
        "Keep Automatic where possible",
        "An empty user-agent value uses the actual Chromium version.",
      ],
      [
        "Enter an override if required",
        "Use the User agent field. For a site-specific override, use Websites and the site’s rule.",
      ],
      [
        "Test and remove if unnecessary",
        "Reopen the page and check the result. Use browser defaults to remove a group override.",
      ],
    ],
    note: "Changing the user agent does not change the engine or every JavaScript browser metadata value.",
  },
  {
    slug: "languages",
    title: "Choose languages and spelling",
    category: "Settings",
    summary: "Keep page preferences and typing assistance comfortable.",
    path: "Settings → Languages",
    steps: [
      [
        "Enable spelling assistance",
        "Turn Spell checking on or off for text entered on websites.",
      ],
      [
        "Choose spelling language",
        "Use the available spelling-language control for your preferred language.",
      ],
      [
        "Set Website languages",
        "Enter ordered language tags such as en-CA,en,fr, or leave the field empty for system defaults.",
      ],
      [
        "Reopen tabs",
        "Reopen pages after changing preferred website languages. Check spelling in an editable website field.",
      ],
    ],
  },
  {
    slug: "keyboard-shortcuts",
    title: "Customize keyboard shortcuts",
    category: "Settings",
    summary: "Reach common actions without leaving the keyboard.",
    path: "Settings → Keyboard shortcuts",
    steps: [
      [
        "Find an action",
        "Open Keyboard shortcuts and locate the browser action you want to change.",
      ],
      [
        "Enter a key combination",
        "Use Command on macOS or Control on Windows/Linux with the desired key.",
      ],
      [
        "Resolve validation feedback",
        "Choose another combination if it is already assigned or reserved for system and editing actions.",
      ],
      [
        "Test the action",
        "Return to browsing and try the shortcut. Keep a note of changes from the default bindings.",
      ],
    ],
  },
  {
    slug: "download-settings",
    title: "Choose where downloads go",
    category: "Settings",
    summary: "Use a consistent folder or select a destination each time.",
    path: "Settings → Downloads",
    steps: [
      [
        "Choose the saving behavior",
        "Review Ask where to save each file. Enable it for a native save dialog on each download.",
      ],
      [
        "Choose a directory",
        "Set the download folder using the directory control. Check that it is writable.",
      ],
      [
        "Download a small file",
        "Confirm the save destination and inspect the result in Downloads.",
      ],
      [
        "Find the result",
        "Open download history with Command+J on macOS or Control+J on Windows/Linux, then use the available file actions.",
      ],
    ],
  },
  {
    slug: "extension-scope",
    title: "Manage extensions by group",
    category: "Settings",
    summary: "Use extensions in the places that need them.",
    path: "Settings → Extensions",
    steps: [
      [
        "Open Extensions",
        "Inspect installed entries and their permission information.",
      ],
      [
        "Select the scope",
        "Choose selected groups or all current and future groups. Confirm which login/session is affected.",
      ],
      [
        "Manage toolbar visibility",
        "Use the Extensions picker to pin icons. Review the icon and order controls in extension management and Appearance.",
      ],
      [
        "Verify in a group",
        "Open a page in the intended group and check the extension. Compare with a group outside the selected scope.",
      ],
    ],
  },
  {
    slug: "about-browser",
    title: "Check your browser version",
    category: "Settings",
    summary: "Find the app and engine information for troubleshooting.",
    path: "Settings → About Kudium Browser",
    steps: [
      ["Open About", "Open Settings and choose About Kudium Browser."],
      [
        "Read both versions",
        "Record the browser version and engine information when describing a problem.",
      ],
      [
        "Check release availability",
        "Use the website’s platform download area to see whether a build has been published.",
      ],
      [
        "Read update details",
        "The service documentation explains release feeds. Current desktop builds use GitHub Releases unless packaged to use the new service.",
      ],
    ],
  },
  {
    slug: "ai-conversations",
    title: "Keep conversations organized",
    category: "AI",
    path: "Assistant → Conversation history",
    summary: "Give each project a clear conversation.",
    steps: [
      [
        "Start a new conversation",
        "Open Assistant and use its conversation controls to begin a new chat.",
      ],
      [
        "Choose context",
        "Select the relevant group and attach only the pages or references needed for the task.",
      ],
      [
        "Find an earlier conversation",
        "Open conversation history and select the chat you want to continue.",
      ],
      [
        "Review before sending",
        "Check the selected model, access mode and attachments before your next prompt.",
      ],
    ],
  },
  {
    slug: "ai-tasks",
    title: "Save an AI task",
    category: "AI",
    path: "Assistant panel → Tasks → New AI task",
    summary: "Turn a repeatable request into a task you can review.",
    steps: [
      [
        "Create a task",
        "Open Tasks and choose New AI task. Describe the task, such as reviewing a staging page.",
      ],
      [
        "Review the draft",
        "Inspect the generated task name and instructions before saving.",
      ],
      [
        "Choose a schedule",
        "Select Manual, Once, Repeat or Daily, then supply the time or interval required by that schedule.",
      ],
      [
        "Manage the task",
        "Review its enabled state and outcomes. Disable or delete it when it is no longer useful.",
      ],
    ],
    note: "A configured model and the browser’s required access are needed. Review actions and outcomes; scheduling a task does not guarantee an external service is available.",
  },
  {
    slug: "ai-skills",
    title: "Add and review AI skills",
    category: "AI",
    path: "Settings → AI assistant → Skills",
    summary: "Give an assistant reusable instructions you understand.",
    steps: [
      ["Open Skills", "Choose the Skills tab in AI assistant settings."],
      [
        "Import a skill",
        "Use the available import control or drop a supported skill into the library.",
      ],
      [
        "Read its instructions",
        "Inspect the skill’s name and instructions before enabling it.",
      ],
      [
        "Manage the library",
        "Use the enable switch for each skill and Remove for entries you no longer need.",
      ],
    ],
    note: "Skills contain instructions. Review them before use and keep credentials out of imported skill files.",
  },
];
tutorials.push(...settingsGuides);

tutorials.push({
  slug: "split-view",
  title: "Compare pages in split view",
  category: "Everyday browsing",
  summary: "Keep a reference and a preview visible together.",
  path: "Group context menu → Split View",
  steps: [
    [
      "Open both pages",
      "Add the reference and preview to your workspace. Choose the page you want to keep visible first.",
    ],
    [
      "Open beside it",
      "Right-click the second group and open its Split View submenu. Choose the left or right placement offered by the menu.",
    ],
    [
      "Work in the intended pane",
      "Select a pane before navigating. Each side keeps its selected page.",
    ],
    [
      "Return to a single page",
      "Use the pane’s close control to leave split view. Your saved tabs remain available.",
    ],
  ],
});
tutorials.push({
  slug: "devtools-and-config",
  title: "Inspect a page with DevTools",
  category: "Developer",
  summary: "Inspect the DOM, console and network of an open website.",
  path: "Settings → Developer → Inspect a profile → Open DevTools",
  steps: [
    [
      "Choose the profile",
      "Open Developer settings and select the profile to inspect. Open the intended website in that profile first.",
    ],
    [
      "Open DevTools",
      "Choose Open DevTools. Confirm the selected page before inspecting its DOM, network and console.",
    ],
    [
      "Investigate the page",
      "Inspect a relevant element or request. Compare the console output with the action that triggered it.",
    ],
    [
      "Find browser configuration",
      "Reveal configuration shows the JSON preferences file. Manual edits take effect on the next launch; prefer the settings UI for normal changes.",
    ],
  ],
});
tutorials.push({
  slug: "personal-data",
  title: "Set up local Personal Data",
  category: "Settings",
  summary: "Save supported personal records with local protection.",
  path: "Settings → Personal Data",
  steps: [
    [
      "Set up protection",
      "Open Personal Data. Use the available operating-system authentication or master-password setup shown for your device.",
    ],
    [
      "Unlock the library",
      "Authenticate when asked before viewing or editing protected records.",
    ],
    [
      "Choose a record type",
      "Use the supported login, profile, payment or knowledge section. For a demonstration, use fictional values and example.com addresses.",
    ],
    [
      "Review scope and edits",
      "Check whether an item is shared or customized for a group. Use Edit to update it and read any confirmation before removal.",
    ],
    [
      "Keep screenshots private",
      "Lock the library when finished. Do not include real login values, payments or recovery material in product captures.",
    ],
  ],
});
