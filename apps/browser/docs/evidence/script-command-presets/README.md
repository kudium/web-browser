# Script command suggestions

The Command field shares its border with a neutral Suggestions button. The popup lists language/tool categories, then shows that category's commands in the same popup with an All languages back action. This avoids sideways submenus extending beyond narrow AI panels. Command descriptions and monospace sources are shown separately; long commands wrap.

Presets cover Node.js (npm/pnpm/Yarn), Bun, Python, PHP, Rust, Go, Ruby, Java/Kotlin, .NET, C/C++ and Docker. Selection replaces the command draft, preserves the name and scope, and returns focus to the command input. It does not save or execute.

Ten DeveloperScripts tests pass, including editable insertion, preserved draft names, focus return and no save/run calls for the six primary requested runtimes. Electron fixtures inspect every category and insert its first command at 620px and 320px in light and dark (44 menu states). Checks cover popup containment, panel portal ownership, grouped input/button geometry, input typography, the back action and focus return. TypeScript and targeted lint pass.
