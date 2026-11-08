# Kudium Browser AI Skills

Open Preferences → AI assistant → Skills → Add skill. Choose From link, Import file, Import folder, or Create skill. You can also drop a local Markdown file or skill folder onto the Skills page. New skills start disabled. Inspect their instructions/resources and enable them when ready. The `project-review` folder here is an installable example using existing project tools.

Kudium Browser stores an independent local copy. Editing the original folder does not change an installed skill; remove and add it again to install updates. Removal never deletes the original folder. Skills are currently enabled globally. Enabled instructions/resources can be shared with the selected provider or connected assistant when read.

Link installs accept direct public HTTPS Markdown files and GitHub file/folder/repository links, and import instructions only (64 KB maximum). Import a local folder to include bundled resources. Redirects and private network destinations are rejected; no browser cookies are sent. Create skill saves the name, description and instructions directly into the local library.

`SKILL.md` may start with YAML frontmatter containing `name` and `description`; otherwise the folder name is used. Bundled text resources can be Markdown, plain text, JSON, YAML, JavaScript, TypeScript, Python, shell, CSS, HTML, or CSV. Images and binaries are not imported. Use at most 40 text files of 64 KB each, with a total of 512 KB; at most 20 skills can be installed. Hidden entries and node_modules are skipped. Symbolic links are rejected.

The AI discovers enabled skills through `list_skills` and retrieves a relevant skill through `read_skill(skillId)`. That returns instructions and resource names; `read_skill(skillId, resource)` retrieves one installed text resource. Local source paths are not returned. Disabled or removed skills are unavailable to these tools.

Skills provide workflows, not new execution capabilities. They cannot grant project/terminal access, change AI permissions, or automatically execute bundled scripts. Their tasks must use the available tools and existing approval controls. Installing a PDF workflow alone does not add a PDF editing engine.
